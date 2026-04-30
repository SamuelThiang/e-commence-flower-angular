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
 * Visible pill is decorative (pointer-events: none). GIS renders in a full-area layer on top
 * with opacity 0 so **real** clicks hit Google’s control — programmatic .click() is unreliable
 * (especially with iframes / FedCM on production HTTPS).
 */
@Component({
  selector: 'app-google-sign-in-button',
  standalone: true,
  template: `
    <div class="relative w-full">
      <!-- Chrome only — clicks pass through to GIS layer above -->
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
      <!-- Invisible hit target — must stay above the chrome and receive pointer events -->
      <div
        #gisHost
        class="absolute inset-0 z-10 flex cursor-pointer items-center justify-center overflow-hidden rounded-full opacity-0"
        [attr.aria-label]="labelText()"
        role="presentation"
      ></div>
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
        '<p class="pointer-events-none px-2 text-center text-[11px] text-zinc-400">Add <code class="font-mono">googleClientId</code> in environment.</p>';
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
}
