import {
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-payment-return',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './payment-return.component.html',
})
export class PaymentReturnComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** ToyyibPay return URL: status_id 1 = paid, 2 = pending, 3 = fail */
  readonly statusId: string | null =
    this.route.snapshot.queryParamMap.get('status_id');
  readonly orderId: string | null =
    this.route.snapshot.queryParamMap.get('order_id');
  /** ToyyibPay documents lowercase `billcode` on return URL */
  readonly billCode: string | null =
    this.route.snapshot.queryParamMap.get('billcode') ??
    this.route.snapshot.queryParamMap.get('billCode');

  readonly title = this.pickTitle(this.statusId);
  readonly body = this.pickBody(this.statusId);

  /** After sandbox/local payment, server callback never runs — we sync via ToyyibPay API */
  readonly syncHint = signal<string | null>(null);
  /** Set only once we actually call sync (so logging in later still triggers sync). */
  private readonly syncRan = signal(false);

  constructor() {
    effect(() => {
      if (!this.auth.isReady()) return;
      if (this.syncRan()) return;
      const sid = this.statusId;
      if (!this.orderId || !this.billCode) return;
      if (sid !== '1' && sid !== '3') return;

      if (!this.auth.user()) {
        this.syncHint.set(
          sid === '3'
            ? 'Sign in to record the failed payment status in our system.'
            : 'Sign in to confirm payment and update your order status in our system.',
        );
        return;
      }

      this.syncRan.set(true);
      if (sid === '1') {
        queueMicrotask(() => this.runSyncSuccess(this.billCode!, this.orderId!));
      } else {
        queueMicrotask(() => this.runSyncFailure(this.billCode!, this.orderId!));
      }
    });
  }

  private runSyncSuccess(billCode: string, orderId: string): void {
    this.syncHint.set('Confirming payment with ToyyibPay…');
    this.http
      .post<{
        synced?: boolean;
        alreadyCompleted?: boolean;
        message?: string;
        error?: string;
      }>(`${environment.apiBaseUrl}/payments/toyyibpay/sync-return`, {
        billCode,
        orderId,
      })
      .subscribe({
        next: (r) => {
          if (r.synced) {
            this.syncHint.set(
              r.alreadyCompleted
                ? 'Order is already being processed.'
                : 'Order updated — payment recorded.',
            );
          } else {
            this.syncHint.set(
              r.message || r.error || 'Payment not confirmed yet — check My orders.',
            );
          }
        },
        error: (err: unknown) => {
          let msg = 'Sync failed — open My orders or try again.';
          if (err && typeof err === 'object' && 'error' in err) {
            const body = (err as { error?: unknown }).error;
            if (typeof body === 'object' && body && 'error' in body) {
              const e = (body as { error?: unknown }).error;
              if (typeof e === 'string' && e.trim()) msg = e.trim();
            }
          }
          this.syncHint.set(msg);
        },
      });
  }

  private runSyncFailure(billCode: string, orderId: string): void {
    this.syncHint.set('Updating payment status…');
    this.http
      .post<{
        synced?: boolean;
        alreadyCompleted?: boolean;
        message?: string;
        error?: string;
      }>(`${environment.apiBaseUrl}/payments/toyyibpay/sync-return`, {
        billCode,
        orderId,
        returnStatusId: '3',
      })
      .subscribe({
        next: (r) => {
          if (r.synced) {
            this.syncHint.set(
              r.alreadyCompleted
                ? 'Status was already up to date.'
                : 'Payment marked as failed in My orders.',
            );
          } else {
            this.syncHint.set(
              r.message || r.error || 'Could not update — check My orders.',
            );
          }
        },
        error: (err: unknown) => {
          let msg = 'Update failed — open My orders or try again.';
          if (err && typeof err === 'object' && 'error' in err) {
            const body = (err as { error?: unknown }).error;
            if (typeof body === 'object' && body && 'error' in body) {
              const e = (body as { error?: unknown }).error;
              if (typeof e === 'string' && e.trim()) msg = e.trim();
            }
          }
          this.syncHint.set(msg);
        },
      });
  }

  private pickTitle(statusId: string | null): string {
    switch (statusId) {
      case '1':
        return 'Payment received';
      case '3':
        return 'Payment unsuccessful';
      case '2':
        return 'Payment pending';
      default:
        return 'Payment status';
    }
  }

  private pickBody(statusId: string | null): string {
    switch (statusId) {
      case '1':
        return 'Thank you. We are syncing your order with ToyyibPay — this may take a moment.';
      case '3':
        return 'The bank or gateway reported a failed payment. You can try again from My Orders if a new bill is available, or contact support.';
      case '2':
        return 'Your payment is still being confirmed. Refresh My Orders in a moment.';
      default:
        return 'Return from ToyyibPay — check My Orders for the latest status.';
    }
  }
}
