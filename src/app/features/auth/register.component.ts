import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { isValidEmail } from '../../core/email-validation';
import {
  isValidPassword,
  passwordValidationMessage,
} from '../../core/password-validation';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Success modal after account is created (navigate on Done). */
  readonly showRegistrationSuccess = signal(false);
  readonly email = signal('');
  readonly password = signal('');
  readonly firstName = signal('');
  readonly lastName = signal('');
  readonly showPassword = signal(false);

  readonly showEmailError = computed(() => {
    const v = this.email().trim();
    if (!v) return false;
    return !isValidEmail(v);
  });

  readonly passwordErrorMessage = computed(() =>
    passwordValidationMessage(this.password()),
  );

  readonly emailApiError = signal<string | null>(null);
  readonly passwordApiError = signal<string | null>(null);
  readonly firstNameApiError = signal<string | null>(null);
  readonly lastNameApiError = signal<string | null>(null);

  clearSubmitError(): void {
    this.emailApiError.set(null);
    this.passwordApiError.set(null);
    this.firstNameApiError.set(null);
    this.lastNameApiError.set(null);
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
    if (!isValidPassword(this.password())) {
      return;
    }
    const result = await this.auth.register(
      this.email(),
      this.password(),
      this.firstName(),
      this.lastName(),
    );
    if (result.ok) {
      this.showRegistrationSuccess.set(true);
      return;
    }
    if (result.target === 'alert') {
      alert(result.message);
      return;
    }
    switch (result.target) {
      case 'email':
        this.emailApiError.set(result.message);
        break;
      case 'password':
        this.passwordApiError.set(result.message);
        break;
      case 'firstName':
        this.firstNameApiError.set(result.message);
        break;
      case 'lastName':
        this.lastNameApiError.set(result.message);
        break;
    }
  }

  google(): void {
    void this.auth.googleLogin();
  }

  onRegistrationSuccessDone(): void {
    this.showRegistrationSuccess.set(false);
    void this.router.navigate(['/login']);
  }
}
