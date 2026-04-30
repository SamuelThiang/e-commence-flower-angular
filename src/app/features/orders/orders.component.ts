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
