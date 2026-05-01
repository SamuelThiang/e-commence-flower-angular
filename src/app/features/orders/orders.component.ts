import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import {
  OrderApiService,
  type RetryPaymentResponse,
} from '../../core/order-api.service';
import type { Order } from '../../shared/catalog';
import { ProductImageUrlPipe } from '../../shared/product-image-url.pipe';

/** Page index or gap marker for the numbered strip */
export type PaginationSlot = number | 'ellipsis';

/** Compact slot list: `1 2 … current … last`, near edges collapse the relevant ellipsis. */
function buildPaginationSlots(total: number, current: number): PaginationSlot[] {
  if (total < 1) return [];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const c = Math.min(Math.max(1, current), total);
  if (c <= 3) return [1, 2, 3, 'ellipsis', total];
  if (c >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
  return [1, 2, 'ellipsis', c, 'ellipsis', total];
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, ProductImageUrlPipe, FormsModule],
  templateUrl: './orders.component.html',
})
export class OrdersComponent {
  private readonly authService = inject(AuthService);
  private readonly orderApi = inject(OrderApiService);

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly needsAuth = signal(true);
  /** Order id currently requesting a new FPX link */
  readonly retryingOrderId = signal<string | null>(null);

  /** Newest-20 window (server cap), not just current page */
  readonly totalOrders = signal(0);
  readonly totalPages = signal(1);
  readonly activeShipmentsCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [5, 10] as const;

  readonly paginationSlots = computed<PaginationSlot[]>(() =>
    buildPaginationSlots(this.totalPages(), this.page()),
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
        this.totalOrders.set(0);
        this.totalPages.set(1);
        this.activeShipmentsCount.set(0);
        this.page.set(1);
        return;
      }
      this.loading.set(true);
      const p = this.page();
      const ps = this.pageSize();
      const sub = this.orderApi.list({ page: p, pageSize: ps }).subscribe({
        next: (r) => {
          const rows = Array.isArray(r.items) ? r.items : [];
          this.orders.set(rows);
          this.totalOrders.set(typeof r.total === 'number' ? r.total : rows.length);
          this.totalPages.set(
            typeof r.totalPages === 'number' && r.totalPages >= 1
              ? r.totalPages
              : 1,
          );
          this.activeShipmentsCount.set(
            typeof r.activeShipmentsInSet === 'number'
              ? r.activeShipmentsInSet
              : rows.filter((o) => o.status === 'In Transit').length,
          );
          this.loading.set(false);
          if (r.total > 0 && p > r.totalPages) {
            this.page.set(r.totalPages);
          }
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

  /** ngModel + ngValue keep numeric page size in sync; property [value] on select is unreliable in Angular. */
  onPageSizeModelChange(n: number): void {
    if (n !== 1 && n !== 5 && n !== 10) return;
    if (this.pageSize() === n) return;
    this.pageSize.set(n);
    this.page.set(1);
  }

  goPrevPage(): void {
    this.page.update((x) => Math.max(1, x - 1));
  }

  goNextPage(): void {
    const max = this.totalPages();
    this.page.update((x) => Math.min(max, x + 1));
  }

  goToPage(n: number): void {
    const max = this.totalPages();
    const next = Math.min(Math.max(1, n), max);
    if (next !== this.page()) this.page.set(next);
  }

  /** Rounded square controls: light border, white fill, navy/zinc icons (pagination mock). */
  paginationArrowBtnClass(): string {
    return [
      // Mobile: 44px tap targets; md+: unchanged from desktop layout
      'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center md:h-10 md:w-10',
      'rounded-lg border border-zinc-200 bg-white text-zinc-900',
      'shadow-sm hover:bg-zinc-50 hover:border-zinc-300',
      'active:bg-zinc-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-zinc-200',
      'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2',
    ].join(' ');
  }

  /** Active page uses project zinc-900 accent (same family as primary CTAs). */
  paginationNumBtnClass(n: number): string {
    const base =
      'inline-flex h-11 min-w-[2.75rem] shrink-0 cursor-pointer items-center justify-center px-2 rounded-lg text-sm font-semibold tabular-nums transition-colors md:h-10 md:min-w-[2.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/25 focus-visible:ring-offset-2 ';
    if (n === this.page()) {
      return (
        base +
        'border-2 border-zinc-900 bg-zinc-100 text-zinc-900 font-bold shadow-sm'
      );
    }
    return base + 'border border-transparent text-zinc-700 hover:bg-zinc-100';
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

  retryPayment(order: Order): void {
    if (this.retryingOrderId()) return;
    this.retryingOrderId.set(order.id);
    this.orderApi.retryPayment(order.id).subscribe({
      next: (r: RetryPaymentResponse) => {
        this.retryingOrderId.set(null);
        if (r.paymentUrl) {
          window.location.assign(r.paymentUrl);
        }
      },
      error: (err: unknown) => {
        this.retryingOrderId.set(null);
        let msg = 'Could not start payment. Try again later.';
        if (err instanceof HttpErrorResponse && err.error != null) {
          const b = err.error as { error?: string; message?: string };
          if (typeof b.error === 'string' && b.error.trim()) {
            msg = b.error.trim();
          } else if (typeof b.message === 'string' && b.message.trim()) {
            msg = b.message.trim();
          }
        }
        alert(msg);
      },
    });
  }
}
