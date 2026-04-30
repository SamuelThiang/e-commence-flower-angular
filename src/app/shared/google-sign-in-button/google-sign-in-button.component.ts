import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Custom pill button (your design) delegates to Google Identity Services via a programmatic
 * click on the hidden GIS control — avoids misaligned / non-clickable invisible overlays.
 */
@Component({
  selector: 'app-google-sign-in-button',
  standalone: true,
  template: `
    <div class="relative w-full">
      <!-- GIS mounts here: invisible, no pointer capture — real clicks use the button below -->
      <div
        #gisHost
        class="pointer-events-none absolute left-0 top-0 z-0 h-full min-h-[52px] w-full opacity-0"
        aria-hidden="true"
      ></div>
      <button
        type="button"
        class="relative z-10 flex w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white py-5 shadow-sm transition-colors hover:bg-zinc-50 active:scale-[0.98]"
        [attr.aria-label]="labelText()"
        (click)="onChromeClick($event)"
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt=""
          class="h-5 w-5 shrink-0"
        />
        <span class="text-xs font-bold uppercase tracking-[0.2em] text-zinc-900">{{
          labelText()
        }}</span>
      </button>
    </div>
  `,
})
export class GoogleSignInButtonComponent implements AfterViewInit {
  private readonly zone = inject(NgZone);
  private readonly gisHostEl = viewChild.required<ElementRef<HTMLElement>>('gisHost');

  readonly variant = input<'signin' | 'signup'>('signin');

  readonly labelText = computed(() =>
    this.variant() === 'signup' ? 'Sign Up with Google' : 'Sign In with Google',
  );

  readonly signedIn = output<string>();

  ngAfterViewInit(): void {
    requestAnimationFrame(() => requestAnimationFrame(() => this.mountGis()));
  }

  private mountGis(): void {
    const clientId = environment.googleClientId?.trim();
    const host = this.gisHostEl()?.nativeElement;
    if (!host) return;

    if (!clientId) {
      host.innerHTML =
        '<span class="sr-only">Configure googleClientId</span>';
      return;
    }

    const run = (): void => {
      const g = window.google?.accounts?.id;
      if (!g) return;
      g.initialize({
        client_id: clientId,
        callback: (resp: { credential: string }) => {
          this.zone.run(() => this.signedIn.emit(resp.credential));
        },
      });
      host.innerHTML = '';
      const row = host.parentElement;
      const w = Math.min((row?.offsetWidth ?? host.offsetWidth) || 384, 520);
      g.renderButton(host, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        width: w,
        shape: 'pill',
        text: this.variant() === 'signup' ? 'signup_with' : 'signin_with',
      });
    };

    if (window.google?.accounts?.id) {
      run();
    } else {
      window.addEventListener('load', run, { once: true });
    }
  }

  onChromeClick(ev: Event): void {
    ev.preventDefault();
    const host = this.gisHostEl()?.nativeElement;
    if (!host?.hasChildNodes()) {
      return;
    }
    const inner =
      (host.querySelector('div[role="button"]') as HTMLElement | null) ??
      (host.querySelector('[tabindex="0"]') as HTMLElement | null);
    if (inner) {
      inner.click();
      return;
    }
    const iframe = host.querySelector('iframe');
    iframe?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    );
  }
}
