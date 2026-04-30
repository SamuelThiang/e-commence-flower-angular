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
 * Renders Google's official GIS button directly. We previously used a transparent
 * overlay over a custom pill so the design matched the site, but on production HTTPS
 * that pattern is fragile (clicks landing on the transparent gap, FedCM peculiarities).
 * Showing the real button is the most reliable approach and matches Google's guidance.
 */
@Component({
  selector: 'app-google-sign-in-button',
  standalone: true,
  template: `
    <div class="flex w-full justify-center">
      <div #gisHost class="flex w-full justify-center"></div>
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
      this.cleanup();
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
        const row = host.parentElement;
        const w = Math.min((row?.offsetWidth ?? host.offsetWidth) || 320, 400);
        g.renderButton(host, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          width: w,
          shape: 'pill',
          text: this.variant() === 'signup' ? 'signup_with' : 'signin_with',
          logo_alignment: 'left',
        });
        console.info('[GoogleSignIn] GIS button mounted.');
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
          '<p class="px-2 text-center text-[11px] text-red-600">Google Sign-In script failed to load. Check network / ad blockers.</p>';
      }
    }, 20000);
  }
}
