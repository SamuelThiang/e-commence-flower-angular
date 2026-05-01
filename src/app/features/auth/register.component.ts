import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ResultDialogService } from '../../shared/result-dialog/result-dialog.service';
import { isValidEmail } from '../../core/email-validation';
import {
  isValidPassword,
  passwordValidationMessage,
} from '../../core/password-validation';
import {
  isValidRegistrationPhone,
  sanitizeRegistrationPhoneInput,
} from '../../core/phone-validation';
import { GoogleSignInButtonComponent } from '../../shared/google-sign-in-button/google-sign-in-button.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, GoogleSignInButtonComponent],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly resultDialog = inject(ResultDialogService);

  readonly email = signal('');
  readonly password = signal('');
  readonly firstName = signal('');
  readonly lastName = signal('');
  readonly phone = signal('');
  readonly showPassword = signal(false);

  readonly showEmailError = computed(() => {
    const v = this.email().trim();
    if (!v) return false;
    return !isValidEmail(v);
  });

  readonly showPhoneFormatError = computed(() => {
    const v = this.phone();
    if (!v) return false;
    return !isValidRegistrationPhone(v);
  });

  readonly passwordErrorMessage = computed(() =>
    passwordValidationMessage(this.password()),
  );

  readonly emailApiError = signal<string | null>(null);
  readonly passwordApiError = signal<string | null>(null);
  readonly firstNameApiError = signal<string | null>(null);
  readonly lastNameApiError = signal<string | null>(null);
  readonly phoneApiError = signal<string | null>(null);

  clearSubmitError(): void {
    this.emailApiError.set(null);
    this.passwordApiError.set(null);
    this.firstNameApiError.set(null);
    this.lastNameApiError.set(null);
    this.phoneApiError.set(null);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  onPhoneInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const cleaned = sanitizeRegistrationPhoneInput(el.value);
    if (el.value !== cleaned) {
      el.value = cleaned;
    }
    this.phone.set(cleaned);
    this.clearSubmitError();
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
    const phone = this.phone();
    if (!phone) {
      this.phoneApiError.set('Phone number is required.');
      return;
    }
    if (!isValidRegistrationPhone(phone)) {
      return;
    }
    const result = await this.auth.register(
      this.email(),
      this.password(),
      this.firstName(),
      this.lastName(),
      phone,
    );
    if (result.ok) {
      this.resultDialog.showSuccess({
        title: 'Registration Successful!',
        message: 'Welcome to the community! Your account is now active.',
        primaryLabel: 'Done',
        onPrimary: () => {
          void this.router.navigate(['/login']);
        },
      });
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
      case 'phone':
        this.phoneApiError.set(result.message);
        break;
    }
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
