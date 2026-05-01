import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { OrderApiService } from '../../core/order-api.service';
import type { Order } from '../../shared/catalog';
import { ProductImageUrlPipe } from '../../shared/product-image-url.pipe';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, ProductImageUrlPipe],
  templateUrl: './orders.component.html',
})
export class OrdersComponent {
  private readonly authService = inject(AuthService);
  private readonly orderApi = inject(OrderApiService);

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly needsAuth = signal(true);

  readonly activeShipments = computed(
    () => this.orders().filter((o) => o.status === 'In Transit').length,
  );

  constructor() {
    effect(() => {
      this.needsAuth.set(!this.authService.user());
    });

    effect((onCleanup) => {
      if (!this.authService.isReady()) {
        return;
      }
      if (!this.authService.user()) {
        this.loading.set(false);
        this.orders.set([]);
        return;
      }
      this.loading.set(true);
      const sub = this.orderApi.list().subscribe({
        next: (data) => {
          this.orders.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.loading.set(false);
          alert('Could not load orders.');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Tailwind chip for order lifecycle status (aligned with server `ORDER_STATUSES`). */
  orderStatusBadgeClass(status: Order['status']): string {
    const base =
      'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ';
    switch (status) {
      case 'Completed':
        return base + 'bg-emerald-50 text-emerald-700';
      case 'In Transit':
        return base + 'bg-blue-50 text-blue-600';
      case 'Ready':
        return base + 'bg-cyan-50 text-cyan-800';
      case 'Processing':
        return base + 'bg-amber-50 text-amber-800';
      case 'Failed':
        return base + 'bg-red-50 text-red-700';
      default:
        return base + 'bg-zinc-100 text-zinc-600';
    }
  }

  formatOrderDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  firstDeliveryAddress(order: Order): string {
    const addr = order.items[0]?.shippingDetails?.[0]?.address;
    return addr ?? '';
  }
}
