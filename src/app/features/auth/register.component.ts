import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  readonly auth = inject(AuthService);
  readonly email = signal('');
  readonly password = signal('');
  readonly firstName = signal('');
  readonly lastName = signal('');

  submit(ev: Event): void {
    ev.preventDefault();
    void this.auth.register(
      this.email(),
      this.password(),
      this.firstName(),
      this.lastName(),
    );
  }

  google(): void {
    void this.auth.googleLogin();
  }
}
