import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  readonly email = signal('');
  readonly password = signal('');

  submit(ev: Event): void {
    ev.preventDefault();
    void this.auth.loginEmail(this.email(), this.password());
  }

  google(): void {
    void this.auth.googleLogin();
  }
}
