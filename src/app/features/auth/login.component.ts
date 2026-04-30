import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { isValidEmail } from '../../core/email-validation';
import { GoogleSignInButtonComponent } from '../../shared/google-sign-in-button/google-sign-in-button.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, GoogleSignInButtonComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  readonly email = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);

  /** True when the field has text and it is not a valid email (shown before submit). */
  readonly showEmailError = computed(() => {
    const v = this.email().trim();
    if (!v) return false;
    return !isValidEmail(v);
  });

  /** Server-side messages (shown under the matching input when BE sends `field`). */
  readonly emailApiError = signal<string | null>(null);
  readonly passwordApiError = signal<string | null>(null);

  clearSubmitError(): void {
    this.emailApiError.set(null);
    this.passwordApiError.set(null);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  async submit(ev: Event): Promise<void> {
    ev.preventDefault();
    this.clearSubmitError();
    const email = this.email().trim();
    if (email && !isValidEmail(email)) {
      return;
    }
    const result = await this.auth.loginEmail(this.email(), this.password());
    if (result.ok) {
      return;
    }
    if (result.target === 'alert') {
      alert(result.message);
      return;
    }
    if (result.target === 'email') {
      this.emailApiError.set(result.message);
      return;
    }
    if (result.target === 'password') {
      this.passwordApiError.set(result.message);
      return;
    }
    alert(result.message);
  }

  async onGoogleCredential(credential: string): Promise<void> {
    const result = await this.auth.loginWithGoogleCredential(credential);
    if (result.ok) return;
    if (result.target === 'alert') {
      alert(result.message);
      return;
    }
    alert(result.message);
  }
}
