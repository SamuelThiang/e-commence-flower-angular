import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export type CheckoutTaxBase =
  | 'subtotal'
  | 'subtotal_and_delivery'
  | 'delivery_only'
  | 'none';

export interface CheckoutSettings {
  priorityCourierFeeMyr: number;
  courierFeeLabel: string;
  sstServiceTaxRatePercent: number;
  taxBase: CheckoutTaxBase;
  taxDisplayLabel: string;
}

/** Matches API defaults when offline or before migration */
export const FALLBACK_CHECKOUT_SETTINGS: CheckoutSettings = {
  priorityCourierFeeMyr: 24,
  courierFeeLabel: 'Priority courier (Lalamove)',
  sstServiceTaxRatePercent: 6,
  taxBase: 'subtotal',
  taxDisplayLabel: 'Estimated SST (service tax)',
};

@Injectable({ providedIn: 'root' })
export class CheckoutSettingsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/checkout-settings`;

  /** Resolved settings (null until the first load attempt completes) */
  readonly settings = signal<CheckoutSettings | null>(null);

  private loadStarted = false;

  ensureLoaded(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    this.load().subscribe({
      error: () => this.settings.set({ ...FALLBACK_CHECKOUT_SETTINGS }),
    });
  }

  load(): Observable<CheckoutSettings> {
    return this.http.get<CheckoutSettings>(this.base).pipe(
      tap((s) => {
        this.settings.set({
          priorityCourierFeeMyr: Number(s.priorityCourierFeeMyr),
          courierFeeLabel: String(s.courierFeeLabel),
          sstServiceTaxRatePercent: Number(s.sstServiceTaxRatePercent),
          taxBase: s.taxBase as CheckoutTaxBase,
          taxDisplayLabel: String(s.taxDisplayLabel),
        });
      }),
    );
  }
}
