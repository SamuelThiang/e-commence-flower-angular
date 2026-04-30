import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CartLine, Product } from '../shared/catalog';
import { AuthService } from './auth.service';
import { CartApiService, type ServerCartDto } from './cart-api.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly auth = inject(AuthService);
  private readonly cartApi = inject(CartApiService);

  private readonly lines = signal<CartLine[]>([]);

  readonly items = this.lines.asReadonly();
  readonly totalCount = computed(() =>
    this.lines().reduce((acc, item) => acc + item.quantity, 0),
  );

  private linesFromDto(dto: ServerCartDto): CartLine[] {
    return dto.items.map((i) => ({
      lineId: i.lineId,
      product: i.product,
      quantity: i.quantity,
      preferredDeliveryDate: i.preferredDeliveryDate,
      needsGiftcard: i.needsGiftcard,
      giftcardMessage: i.giftcardMessage || '',
    }));
  }

  private applyServerDto(dto: ServerCartDto): void {
    this.lines.set(this.linesFromDto(dto));
  }

  /** Called after JWT session restore (page load). */
  async hydrateFromServer(): Promise<void> {
    if (!this.auth.user()) return;
    try {
      const dto = await firstValueFrom(this.cartApi.getCart());
      this.applyServerDto(dto);
    } catch (e) {
      console.error(e);
    }
  }

  /** Merge in-memory guest lines into server cart, then replace local state. */
  async onLoginSuccess(): Promise<void> {
    const guest = [...this.lines()];
    if (guest.length > 0) {
      const dto = await firstValueFrom(
        this.cartApi.mergeGuest(
          guest.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
            preferredDeliveryDate: l.preferredDeliveryDate,
            needsGiftcard: l.needsGiftcard,
            giftcardMessage: l.giftcardMessage || '',
          })),
        ),
      );
      this.applyServerDto(dto);
      return;
    }
    await this.hydrateFromServer();
  }

  getTomorrow(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  addToCart(product: Product, preferredDeliveryDate?: string): void {
    const date = preferredDeliveryDate || this.getTomorrow();
    if (this.auth.user()) {
      this.cartApi
        .addItem({
          productId: product.id,
          preferredDeliveryDate: date,
          quantityDelta: 1,
        })
        .subscribe({
          next: (dto) => this.applyServerDto(dto),
          error: (e) => console.error(e),
        });
      return;
    }
    this.lines.update((prev) => {
      const existing = prev.find(
        (item) =>
          item.product.id === product.id &&
          item.preferredDeliveryDate === date,
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id &&
          item.preferredDeliveryDate === date
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { product, quantity: 1, preferredDeliveryDate: date }];
    });
  }

  removeFromCart(id: string, preferredDeliveryDate: string): void {
    if (this.auth.user()) {
      const line = this.lines().find(
        (l) =>
          l.product.id === id &&
          l.preferredDeliveryDate === preferredDeliveryDate,
      );
      if (line?.lineId) {
        this.cartApi.removeLine(line.lineId).subscribe({
          next: (dto) => this.applyServerDto(dto),
          error: (e) => console.error(e),
        });
        return;
      }
    }
    this.lines.update((prev) =>
      prev.filter(
        (item) =>
          !(
            item.product.id === id &&
            item.preferredDeliveryDate === preferredDeliveryDate
          ),
      ),
    );
  }

  updateQuantity(
    id: string,
    preferredDeliveryDate: string,
    delta: number,
  ): void {
    const item = this.lines().find(
      (l) =>
        l.product.id === id && l.preferredDeliveryDate === preferredDeliveryDate,
    );
    if (!item) return;
    const newQty = Math.max(1, item.quantity + delta);

    if (this.auth.user() && item.lineId) {
      this.cartApi.patchLine(item.lineId, { quantity: newQty }).subscribe({
        next: (dto) => this.applyServerDto(dto),
        error: (e) => console.error(e),
      });
      return;
    }

    this.lines.update((prev) =>
      prev.map((row) => {
        if (
          row.product.id === id &&
          row.preferredDeliveryDate === preferredDeliveryDate
        ) {
          return { ...row, quantity: newQty };
        }
        return row;
      }),
    );
  }

  updateDeliveryDate(id: string, oldDate: string, newDate: string): void {
    const itemToUpdate = this.lines().find(
      (item) =>
        item.product.id === id && item.preferredDeliveryDate === oldDate,
    );
    if (!itemToUpdate) return;

    if (this.auth.user() && itemToUpdate.lineId) {
      this.cartApi
        .patchLine(itemToUpdate.lineId, {
          preferredDeliveryDate: newDate,
        })
        .subscribe({
          next: (dto) => this.applyServerDto(dto),
          error: (e) => console.error(e),
        });
      return;
    }

    this.lines.update((prev) => {
      const otherItems = prev.filter(
        (item) =>
          !(item.product.id === id && item.preferredDeliveryDate === oldDate),
      );
      const existingItemWithNewDate = otherItems.find(
        (item) =>
          item.product.id === id &&
          item.preferredDeliveryDate === newDate,
      );

      if (existingItemWithNewDate) {
        return otherItems.map((item) =>
          item.product.id === id &&
          item.preferredDeliveryDate === newDate
            ? {
                ...item,
                quantity: item.quantity + itemToUpdate.quantity,
              }
            : item,
        );
      }
      return [
        ...otherItems,
        { ...itemToUpdate, preferredDeliveryDate: newDate },
      ];
    });
  }

  /** Clears server cart when logged in, or local lines when guest. */
  clear(): void {
    if (this.auth.user()) {
      this.cartApi.clearAll().subscribe({
        next: (dto) => this.applyServerDto(dto),
        error: () => this.lines.set([]),
      });
      return;
    }
    this.lines.set([]);
  }

  /** After order placed — server cart already cleared by checkout API. */
  clearAfterOrderSuccess(): void {
    this.lines.set([]);
  }

  /** Drop local lines on logout (server cart kept for next session). */
  resetLocalForLogout(): void {
    this.lines.set([]);
  }

  setLines(lines: CartLine[]): void {
    this.lines.set(lines);
  }
}
