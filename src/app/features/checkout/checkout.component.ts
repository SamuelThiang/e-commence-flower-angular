import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../core/firebase';
import { CartService } from '../../core/cart.service';
import {
  handleFirestoreError,
  OperationType,
} from '../../core/firestore-errors';
import type { CartLine } from '../../shared/catalog';

type UnitDetail = {
  address: string;
  hasGiftCard: boolean;
  giftMessage: string;
  preferredDeliveryDate: string;
};

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './checkout.component.html',
})
export class CheckoutComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly cartService = inject(CartService);

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

    let addressUnsub: (() => void) | null = null;
    const authUnsub = onAuthStateChanged(auth, (user) => {
      addressUnsub?.();
      addressUnsub = null;
      if (!user) return;
      const q = query(
        collection(db, 'addresses'),
        where('uid', '==', user.uid),
        where('isDefault', '==', true),
      );
      addressUnsub = onSnapshot(
        q,
        (snapshot) => {
          if (snapshot.empty) return;
          const addr = snapshot.docs[0].data() as { address: string };
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
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'addresses'),
      );
    });
    this.destroyRef.onDestroy(() => {
      authUnsub();
      addressUnsub?.();
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

  async placeOrder(): Promise<void> {
    if (!auth.currentUser) {
      await this.router.navigate(['/login']);
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
    try {
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
          product: item.product,
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
        uid: auth.currentUser.uid,
        preferredDeliveryDate:
          this.deliveryOption() === 'pickup'
            ? new Date().toISOString().split('T')[0]
            : this.shippingDetails()[us[0]?.key]?.preferredDeliveryDate ||
              this.getTomorrow(),
        deliveryOption: this.deliveryOption(),
      };

      await setDoc(doc(db, 'orders', newOrder.id), newOrder);

      for (const item of cart) {
        const productRef = doc(db, 'products', item.product.id);
        try {
          await updateDoc(productRef, {
            orderCount: increment(item.quantity),
          });
        } catch (e) {
          console.warn(`Could not update orderCount for product ${item.product.id}:`, e);
        }
      }

      this.cartService.clear();
      await this.router.navigate(['/orders']);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
