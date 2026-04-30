import { Injectable, inject, signal, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { TOKEN_KEY } from './auth.interceptor';
import { CartService } from './cart.service';

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  phone: string;
  role: string;
}

/** Matches backend `field` on auth errors (show message under that control). */
export type AuthFieldTarget =
  | 'email'
  | 'password'
  | 'firstName'
  | 'lastName';

/**
 * Backend: `{ message, field?, kind? }`.
 * - `field` → show under that input
 * - `kind: 'system' | 'token'` OR network / 5xx → `alert()` only
 */
export type AuthActionResult =
  | { ok: true }
  | { ok: false; target: AuthFieldTarget; message: string }
  | { ok: false; target: 'alert'; message: string };

const POST_AUTH_RETURN_KEY = 'flower_post_auth_return';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly apiUrl = environment.apiBaseUrl;

  private readonly userSignal = signal<AppUser | null>(null);
  private readonly readySignal = signal(false);

  readonly user = this.userSignal.asReadonly();
  readonly isReady = this.readySignal.asReadonly();

  constructor() {
    void this.hydrateFromToken();
  }

  private async hydrateFromToken(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      this.readySignal.set(true);
      return;
    }
    try {
      const user = await firstValueFrom(
        this.http.get<AppUser>(`${this.apiUrl}/auth/me`),
      );
      this.userSignal.set(user);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      this.userSignal.set(null);
    } finally {
      this.readySignal.set(true);
      if (this.userSignal()) {
        try {
          await this.injector.get(CartService).hydrateFromServer();
        } catch {
          /* cart API optional */
        }
      }
    }
  }

  private persistSession(token: string, user: AppUser): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.userSignal.set(user);
  }

  async googleLogin(): Promise<void> {
    alert(
      'Google sign-in is not enabled for this backend. Please use email and password.',
    );
  }

  async loginEmail(email: string, pass: string): Promise<AuthActionResult> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ token: string; user: AppUser }>(
          `${this.apiUrl}/auth/login`,
          { email, password: pass },
        ),
      );
      this.persistSession(res.token, res.user);
      try {
        await this.injector.get(CartService).onLoginSuccess();
      } catch (e) {
        console.error(e);
      }
      await this.navigateAfterLogin(res.user);
      return { ok: true };
    } catch (e: unknown) {
      console.error('Login error:', e);
      return this.authHttpResult(e, 'Failed to sign in.');
    }
  }

  async register(
    email: string,
    pass: string,
    firstName: string,
    lastName: string,
  ): Promise<AuthActionResult> {
    try {
      await firstValueFrom(
        this.http.post<{ token: string; user: AppUser }>(
          `${this.apiUrl}/auth/register`,
          { email, password: pass, firstName, lastName },
        ),
      );
      // Do not persist token — user signs in explicitly on the login page after Done.
      localStorage.removeItem(TOKEN_KEY);
      this.userSignal.set(null);
      return { ok: true };
    } catch (e: unknown) {
      console.error('Registration error:', e);
      return this.authHttpResult(e, 'Failed to create account.');
    }
  }

  /**
   * After sign-in, navigate here (e.g. `/checkout`) instead of home/profile.
   * Survives register → login; cleared when consumed.
   */
  setPostAuthRedirect(path: string): void {
    if (!this.isSafeInternalPath(path)) return;
    sessionStorage.setItem(POST_AUTH_RETURN_KEY, path);
  }

  private isSafeInternalPath(path: string): boolean {
    return (
      path.startsWith('/') &&
      !path.startsWith('//') &&
      !path.includes('://')
    );
  }

  private consumePostAuthRedirect(): string | null {
    const v = sessionStorage.getItem(POST_AUTH_RETURN_KEY);
    sessionStorage.removeItem(POST_AUTH_RETURN_KEY);
    if (v && this.isSafeInternalPath(v)) return v;
    return null;
  }

  private async navigateAfterLogin(user: AppUser): Promise<void> {
    const ret = this.consumePostAuthRedirect();
    if (ret) {
      await this.router.navigateByUrl(ret);
      return;
    }
    if (!user.phone?.trim()) {
      await this.router.navigate(['/profile']);
    } else {
      await this.router.navigate(['/home']);
    }
  }

  private authHttpResult(error: unknown, fallback: string): AuthActionResult {
    if (!(error instanceof HttpErrorResponse)) {
      return { ok: false, target: 'alert', message: fallback };
    }

    const status = error.status;
    const body = error.error;

    let message = fallback;
    let kind: string | undefined;
    let field: unknown;

    if (body && typeof body === 'object' && body !== null) {
      if (
        'message' in body &&
        typeof (body as { message: unknown }).message === 'string'
      ) {
        const m = (body as { message: string }).message.trim();
        if (m) message = m;
      } else if (
        'error' in body &&
        typeof (body as { error: unknown }).error === 'string'
      ) {
        const m = (body as { error: string }).error.trim();
        if (m) message = m;
      }
      if (
        'kind' in body &&
        typeof (body as { kind: unknown }).kind === 'string'
      ) {
        kind = (body as { kind: string }).kind;
      }
      if ('field' in body) {
        field = (body as { field: unknown }).field;
      }
    }

    if (kind === 'system' || kind === 'token') {
      return { ok: false, target: 'alert', message };
    }

    if (status === 0) {
      return {
        ok: false,
        target: 'alert',
        message: 'Cannot reach server. Check your connection.',
      };
    }

    if (status >= 500) {
      return { ok: false, target: 'alert', message };
    }

    if (
      field === 'email' ||
      field === 'password' ||
      field === 'firstName' ||
      field === 'lastName'
    ) {
      return { ok: false, target: field, message };
    }

    return { ok: false, target: 'email', message };
  }

  async logout(): Promise<void> {
    localStorage.removeItem(TOKEN_KEY);
    this.userSignal.set(null);
    await this.router.navigate(['/login']);
  }

  /** Refresh user from server (e.g. after profile phone update). */
  async refreshUser(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const user = await firstValueFrom(
        this.http.get<AppUser>(`${this.apiUrl}/auth/me`),
      );
      this.userSignal.set(user);
    } catch {
      /* ignore */
    }
  }
}
