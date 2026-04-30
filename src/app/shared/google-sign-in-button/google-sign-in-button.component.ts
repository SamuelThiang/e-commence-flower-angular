import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Custom-styled Google Sign-In:
 *
 * - Decorative pill is `pointer-events-none` (purely visual, matches site design).
 * - Real GIS button is rendered into a transparent overlay on top.
 * - After GIS renders, we forcibly stretch its internal wrapper(s) to 100% width AND
 *   100% height (with a MutationObserver to re-apply if Google re-renders), so a click
 *   anywhere on the pill lands on Google's real button — no transparent click gaps.
 * - Programmatic `.click()` on the GIS iframe is unreliable on HTTPS/FedCM, so we let
 *   the user's real pointer event hit it directly.
 * - We poll for `window.google.accounts.id` because in an SPA the `load` event has
 *   already fired by the time the user navigates to /login.
 */
@Component({
  selector: 'app-google-sign-in-button',
  standalone: true,
  template: `
    <div class="relative w-full" style='height: 63px;'>
      <div
        class="pointer-events-none relative z-0 flex w-full items-center justify-center gap-3 rounded-full border border-zinc-200 bg-white py-5 shadow-sm"
        aria-hidden="true"
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt=""
          class="h-5 w-5 shrink-0"
        />
        <span class="text-xs font-bold uppercase tracking-[0.2em] text-zinc-900">{{
          labelText()
        }}</span>
      </div>
      <div
        #gisHost
        class="absolute inset-0 z-10 cursor-pointer overflow-hidden rounded-full opacity-0"
        [attr.aria-label]="labelText()"
        role="presentation"
      ></div>
    </div>
  `,
})
export class GoogleSignInButtonComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly gisHostEl = viewChild.required<ElementRef<HTMLElement>>('gisHost');

  readonly variant = input<'signin' | 'signup'>('signin');

  readonly labelText = computed(() =>
    this.variant() === 'signup' ? 'Sign Up with Google' : 'Sign In with Google',
  );

  readonly signedIn = output<string>();

  private pollId: number | null = null;
  private failTimerId: number | null = null;
  private mutationObserver: MutationObserver | null = null;
  private mounted = false;

  ngAfterViewInit(): void {
    requestAnimationFrame(() => requestAnimationFrame(() => this.mountGis()));
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.pollId !== null) {
      window.clearInterval(this.pollId);
      this.pollId = null;
    }
    if (this.failTimerId !== null) {
      window.clearTimeout(this.failTimerId);
      this.failTimerId = null;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  /** Force GIS's nested wrappers + iframe to fill the overlay so clicks anywhere hit the button. */
  private stretchGisToFill(host: HTMLElement): void {
    const fillStyles = (el: HTMLElement): void => {
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.display = 'block';
    };
    host.querySelectorAll<HTMLElement>(':scope > div, :scope > div > div').forEach(fillStyles);
    const iframe = host.querySelector<HTMLIFrameElement>('iframe');
    if (iframe) {
      iframe.style.width = '100%';
      iframe.style.height = '100%';
    }
  }

  private mountGis(): void {
    const clientId = environment.googleClientId?.trim();
    const host = this.gisHostEl()?.nativeElement;
    if (!host) return;

    if (!clientId) {
      console.warn('[GoogleSignIn] environment.googleClientId is empty — button disabled.');
      host.innerHTML = '<span class="sr-only">Configure googleClientId</span>';
      return;
    }

    const tryRun = (): void => {
      const g = window.google?.accounts?.id;
      if (!g || this.mounted) return;
      this.mounted = true;
      if (this.pollId !== null) {
        window.clearInterval(this.pollId);
        this.pollId = null;
      }
      if (this.failTimerId !== null) {
        window.clearTimeout(this.failTimerId);
        this.failTimerId = null;
      }
      try {
        g.initialize({
          client_id: clientId,
          callback: (resp: { credential: string }) => {
            console.info('[GoogleSignIn] credential received, length=', resp.credential?.length ?? 0);
            this.zone.run(() => this.signedIn.emit(resp.credential));
          },
          auto_select: false,
          ux_mode: 'popup',
        });
        host.innerHTML = '';
        const w = Math.max(host.offsetWidth || 320, 240);
        g.renderButton(host, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          width: w,
          shape: 'pill',
          text: this.variant() === 'signup' ? 'signup_with' : 'signin_with',
          logo_alignment: 'center',
        });
        this.stretchGisToFill(host);
        this.mutationObserver = new MutationObserver(() => this.stretchGisToFill(host));
        this.mutationObserver.observe(host, { childList: true, subtree: true });
        console.info('[GoogleSignIn] GIS button mounted (overlay design).');
      } catch (err) {
        console.error('[GoogleSignIn] initialize/renderButton failed:', err);
      }
    };

    if (window.google?.accounts?.id) {
      tryRun();
      return;
    }

    window.addEventListener('load', tryRun, { once: true });
    this.pollId = window.setInterval(tryRun, 50);
    this.failTimerId = window.setTimeout(() => {
      this.cleanup();
      if (!this.mounted) {
        console.error(
          '[GoogleSignIn] gsi/client never loaded after 20s. Check network tab / blockers / CSP.',
        );
        host.innerHTML =
          '<p class="pointer-events-none px-2 text-center text-[11px] text-red-600">Google Sign-In script failed to load.</p>';
      }
    }, 20000);
  }
}
