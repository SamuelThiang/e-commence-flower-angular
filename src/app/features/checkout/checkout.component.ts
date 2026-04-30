import {
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { AddressApiService } from '../../core/address-api.service';
import { OrderApiService } from '../../core/order-api.service';
import { CartService } from '../../core/cart.service';
import type { CartLine } from '../../shared/catalog';
import { ProductImageUrlPipe } from '../../shared/product-image-url.pipe';
import { ResultDialogService } from '../../shared/result-dialog/result-dialog.service';

type UnitDetail = {
  address: string;
  hasGiftCard: boolean;
  giftMessage: string;
  preferredDeliveryDate: string;
};

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [LucideAngularModule, ProductImageUrlPipe],
  templateUrl: './checkout.component.html',
})
export class CheckoutComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly addressApi = inject(AddressApiService);
  private readonly orderApi = inject(OrderApiService);
  readonly cartService = inject(CartService);
  private readonly resultDialog = inject(ResultDialogService);

  /** One prompt per checkout visit (new component instance after login). */
  private checkoutLoginPromptShown = false;

  readonly isProductsExpanded = signal(true);
  readonly isSummaryExpanded = signal(true);
  readonly shippingDetails = signal<Record<string, UnitDetail>>({});
  readonly isSubmitting = signal(false);
  readonly syncGiftCards = signal(false);
  readonly syncDeliveryDates = signal(false);
  readonly deliveryOption = signal<'delivery' | 'pickup'>('delivery');
  readonly isLg = signal(
    typeof window !== 'undefined' && window.innerWidth >= 1024,
  );

  readonly SHOP_ADDRESS =
    'The Ethereal Florist Flagship, Lot G-12, Empire Shopping Gallery, Subang Jaya';

  readonly cart = computed(() => this.cartService.items());

  readonly units = computed(() => {
    const c = this.cart();
    return c.flatMap((item, itemIdx) =>
      Array.from({ length: item.quantity }, (_, unitIdx) => ({
        product: item.product,
        key: `${itemIdx}_${unitIdx}`,
        itemIdx,
        unitIdx,
        preferredDeliveryDate: item.preferredDeliveryDate,
      })),
    );
  });

  constructor() {
    if (this.cart().length === 0) {
      void this.router.navigate(['/cart']);
    }
    this.shippingDetails.set(this.buildInitialShippingDetails(this.cart()));

    effect(() => {
      if (!this.authService.isReady()) return;
      if (this.authService.user()) return;
      if (this.cart().length === 0) return;
      if (this.checkoutLoginPromptShown) return;
      this.checkoutLoginPromptShown = true;
      queueMicrotask(() => {
        this.resultDialog.showInfo({
          title: 'Sign in to continue',
          message:
            'Please log in or create an account before checkout. Your cart will stay here when you come back.',
          primaryLabel: 'OK',
          onPrimary: () => {
            this.authService.setPostAuthRedirect('/checkout');
            void this.router.navigate(['/login']);
          },
        });
      });
    });

    effect((onCleanup) => {
      if (!this.authService.isReady() || !this.authService.user()) {
        return;
      }
      const sub = this.addressApi.getDefault().subscribe({
        next: (addr) => {
          if (!addr?.address) return;
          this.shippingDetails.update((prev) => {
            const next = { ...prev };
            for (const u of this.units()) {
              if (!next[u.key]?.address) {
                next[u.key] = {
                  ...(next[u.key] || {
                    hasGiftCard: false,
                    giftMessage: '',
                    preferredDeliveryDate: u.preferredDeliveryDate,
                  }),
                  address: addr.address,
                };
              }
            }
            return next;
          });
        },
        error: (err) => console.error(err),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isLg.set(window.innerWidth >= 1024);
  }

  private buildInitialShippingDetails(cart: CartLine[]): Record<string, UnitDetail> {
    const initial: Record<string, UnitDetail> = {};
    cart.forEach((item, itemIdx) => {
      for (let unitIdx = 0; unitIdx < item.quantity; unitIdx++) {
        const key = `${itemIdx}_${unitIdx}`;
        initial[key] = {
          address: '',
          hasGiftCard: false,
          giftMessage: '',
          preferredDeliveryDate: item.preferredDeliveryDate,
        };
      }
    });
    return initial;
  }

  getTomorrow(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  readonly subtotal = computed(() =>
    this.cart().reduce((acc, item) => acc + item.product.price * item.quantity, 0),
  );

  readonly shipping = computed(() =>
    this.deliveryOption() === 'pickup' ? 0 : 24,
  );

  readonly tax = computed(() => this.subtotal() * 0.036);

  readonly total = computed(
    () => this.subtotal() + this.shipping() + this.tax(),
  );

  readonly placeOrderDisabled = computed(
    () =>
      this.isSubmitting() ||
      (this.deliveryOption() === 'delivery' &&
        this.units().some((u) => !this.shippingDetails()[u.key]?.address)),
  );

  handleDetailChange(key: string, field: keyof UnitDetail, value: unknown): void {
    const us = this.units();
    const v = value as never;
    this.shippingDetails.update((prev) => {
      const prevEntry = prev[key];
      const base: UnitDetail = {
        address: prevEntry?.address ?? '',
        hasGiftCard: prevEntry?.hasGiftCard ?? false,
        giftMessage: prevEntry?.giftMessage ?? '',
        preferredDeliveryDate:
          prevEntry?.preferredDeliveryDate ?? this.getTomorrow(),
      };
      const newDetails: Record<string, UnitDetail> = {
        ...prev,
        [key]: { ...base, [field]: v },
      };

      if (
        this.syncGiftCards() &&
        field === 'giftMessage' &&
        key === us[0]?.key
      ) {
        for (const unit of us) {
          if (unit.key !== key && newDetails[unit.key]?.hasGiftCard) {
            newDetails[unit.key] = {
              ...newDetails[unit.key],
              giftMessage: v as string,
            };
          }
        }
      }
      if (
        this.syncDeliveryDates() &&
        field === 'preferredDeliveryDate' &&
        key === us[0]?.key
      ) {
        for (const unit of us) {
          if (unit.key !== key) {
            newDetails[unit.key] = {
              ...newDetails[unit.key],
              preferredDeliveryDate: v as string,
            };
          }
        }
      }
      return newDetails;
    });
  }

  showProductsBlock(): boolean {
    return this.isProductsExpanded() || this.isLg();
  }

  showSummaryBlock(): boolean {
    return this.isSummaryExpanded() || this.isLg();
  }

  /** Typed lookup so templates avoid `?.` on index access (NG8107). */
  unitDetail(key: string): UnitDetail | undefined {
    return this.shippingDetails()[key];
  }

  toggleProductsExpanded(): void {
    this.isProductsExpanded.update((v) => !v);
  }

  toggleSummaryExpanded(): void {
    this.isSummaryExpanded.update((v) => !v);
  }

  private orderErrorTextFromHttp(err: unknown): string {
    const fallback = 'Could not place order. Please try again.';
    if (!(err instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (err.status === 0) {
      return 'Cannot reach server. Check your connection.';
    }
    const b = err.error;
    if (b && typeof b === 'object' && b !== null) {
      if (typeof (b as { error?: string }).error === 'string') {
        const m = (b as { error: string }).error.trim();
        if (m) return m;
      }
      if (typeof (b as { message?: string }).message === 'string') {
        const m = (b as { message: string }).message.trim();
        if (m) return m;
      }
      if (typeof (b as { detail?: string }).detail === 'string') {
        const m = (b as { detail: string }).detail.trim();
        if (m) return m;
      }
    }
    return fallback;
  }

  placeOrder(): void {
    const user = this.authService.user();
    if (!user) {
      this.authService.setPostAuthRedirect('/checkout');
      void this.router.navigate(['/login']);
      return;
    }
    const cart = this.cart();
    const us = this.units();
    if (
      this.deliveryOption() === 'delivery' &&
      us.some((u) => !this.shippingDetails()[u.key]?.address)
    ) {
      return;
    }

    this.isSubmitting.set(true);
    const orderItems = cart.map((item, itemIdx) => {
      const itemShippingDetails = Array.from(
        { length: item.quantity },
        (_, unitIdx) => {
          const detail = this.shippingDetails()[`${itemIdx}_${unitIdx}`];
          return {
            address:
              this.deliveryOption() === 'pickup'
                ? this.SHOP_ADDRESS
                : detail?.address || '',
            hasGiftCard: detail?.hasGiftCard || false,
            giftMessage: detail?.giftMessage || '',
            preferredDeliveryDate:
              this.deliveryOption() === 'pickup'
                ? new Date().toISOString().split('T')[0]
                : detail?.preferredDeliveryDate || this.getTomorrow(),
          };
        },
      );
      return {
        productId: item.product.id,
        quantity: item.quantity,
        shippingDetails: itemShippingDetails,
      };
    });

    const total = this.total();
    const newOrder = {
      id: `ORD-${Date.now()}`,
      date: new Date().toISOString(),
      status: 'Processing' as const,
      items: orderItems,
      total,
      preferredDeliveryDate:
        this.deliveryOption() === 'pickup'
          ? new Date().toISOString().split('T')[0]
          : this.shippingDetails()[us[0]?.key]?.preferredDeliveryDate ||
            this.getTomorrow(),
      deliveryOption: this.deliveryOption(),
    };

    this.orderApi
      .create(newOrder)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (order) => {
          this.cartService.clearAfterOrderSuccess();
          this.resultDialog.showSuccess({
            title: 'Order successful!',
            message:
              "Thank you! Your order has been placed and we're preparing your specimens.",
            detailLine: order.id,
            primaryLabel: 'Done',
            onPrimary: () => {
              void this.router.navigate(['/orders']);
            },
          });
        },
        error: (err) => {
          console.error(err);
          this.resultDialog.showError({
            title: 'Order not placed',
            message: this.orderErrorTextFromHttp(err),
            primaryLabel: 'OK',
          });
        },
      });
  }
}
