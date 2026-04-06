import { Injectable, signal, computed } from '@angular/core';
import type { CartLine, Product } from '../shared/catalog';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly lines = signal<CartLine[]>([]);

  readonly items = this.lines.asReadonly();
  readonly totalCount = computed(() =>
    this.lines().reduce((acc, item) => acc + item.quantity, 0),
  );

  getTomorrow(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  addToCart(product: Product, preferredDeliveryDate?: string): void {
    const date = preferredDeliveryDate || this.getTomorrow();
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
    this.lines.update((prev) =>
      prev.map((item) => {
        if (
          item.product.id === id &&
          item.preferredDeliveryDate === preferredDeliveryDate
        ) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      }),
    );
  }

  updateDeliveryDate(id: string, oldDate: string, newDate: string): void {
    this.lines.update((prev) => {
      const itemToUpdate = prev.find(
        (item) =>
          item.product.id === id && item.preferredDeliveryDate === oldDate,
      );
      if (!itemToUpdate) return prev;

      const otherItems = prev.filter(
        (item) =>
          !(
            item.product.id === id &&
            item.preferredDeliveryDate === oldDate
          ),
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

  clear(): void {
    this.lines.set([]);
  }

  setLines(lines: CartLine[]): void {
    this.lines.set(lines);
  }
}
