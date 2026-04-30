import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ProductImageUrlPipe } from '../../shared/product-image-url.pipe';
import { CartService } from '../../core/cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, ProductImageUrlPipe],
  templateUrl: './cart.component.html',
})
export class CartComponent {
  readonly cartService = inject(CartService);

  readonly editing = signal<{
    id: string;
    oldDate: string;
    newDate: string;
    name: string;
  } | null>(null);

  readonly subtotal = computed(() =>
    this.cartService
      .items()
      .reduce((acc, item) => acc + item.product.price * item.quantity, 0),
  );

  readonly shipping = 24;
  readonly tax = computed(() => this.subtotal() * 0.036);
  readonly total = computed(
    () => this.subtotal() + this.shipping + this.tax(),
  );

  openEdit(item: {
    product: { id: string; name: string };
    preferredDeliveryDate: string;
  }): void {
    this.editing.set({
      id: item.product.id,
      oldDate: item.preferredDeliveryDate,
      newDate: item.preferredDeliveryDate,
      name: item.product.name,
    });
  }

  confirmEdit(): void {
    const e = this.editing();
    if (!e) return;
    this.cartService.updateDeliveryDate(e.id, e.oldDate, e.newDate);
    this.editing.set(null);
  }

  todayIso(): string {
    return new Date().toISOString().split('T')[0];
  }

  patchEditDate(value: string): void {
    const e = this.editing();
    if (e) this.editing.set({ ...e, newDate: value });
  }
}
