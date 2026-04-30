import { Injectable, signal } from '@angular/core';

export interface ResultDialogPayload {
  variant: 'success' | 'error';
  title: string;
  message: string;
  detailLine?: string | null;
  primaryLabel?: string;
  onPrimary?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ResultDialogService {
  private readonly stateSignal = signal<ResultDialogPayload | null>(null);

  /** Current dialog payload, or null when closed. */
  readonly state = this.stateSignal.asReadonly();

  showSuccess(options: Omit<ResultDialogPayload, 'variant'>): void {
    this.stateSignal.set({ ...options, variant: 'success' });
  }

  showError(options: Omit<ResultDialogPayload, 'variant'>): void {
    this.stateSignal.set({ ...options, variant: 'error' });
  }

  dismiss(): void {
    this.stateSignal.set(null);
  }

  /** Primary button: closes dialog then runs optional callback (e.g. navigate). */
  confirmPrimary(): void {
    const payload = this.stateSignal();
    if (!payload) {
      return;
    }
    const cb = payload.onPrimary;
    this.stateSignal.set(null);
    cb?.();
  }
}
