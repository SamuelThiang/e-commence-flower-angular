import { Injectable, inject } from '@angular/core';
import { NgxSpinnerService } from 'ngx-spinner';

/** Minimum time the overlay stays visible so fast HTTP/router cycles still render one frame. */
const MIN_VISIBLE_MS = 280;

/**
 * Centralised reference-counted loading state.
 * Every caller that increments must decrement exactly once (use try/finally).
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly spinner = inject(NgxSpinnerService);
  private count = 0;
  /** Incremented whenever we go from 0 → 1 active loads (invalidates pending hide). */
  private hideGeneration = 0;
  private shownAt = 0;

  show(): void {
    this.count++;
    if (this.count === 1) {
      this.hideGeneration++;
      this.shownAt = Date.now();
      this.spinner.show();
    }
  }

  hide(): void {
    this.count = Math.max(0, this.count - 1);
    if (this.count > 0) {
      return;
    }

    const gen = this.hideGeneration;
    const elapsed = Date.now() - this.shownAt;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);

    window.setTimeout(() => {
      if (this.count === 0 && gen === this.hideGeneration) {
        this.spinner.hide();
      }
    }, delay);
  }
}
