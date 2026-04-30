import { Component, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { AddressApiService } from '../../core/address-api.service';
import type { UserAddress } from '../../shared/catalog';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
})
export class ProfileComponent {
  readonly authService = inject(AuthService);
  private readonly addressApi = inject(AddressApiService);
  private readonly http = inject(HttpClient);

  readonly addresses = signal<UserAddress[]>([]);
  readonly newAddress = signal({ address: '', label: '' });
  readonly isAdding = signal(false);
  readonly phone = signal('');
  readonly isUpdatingPhone = signal(false);

  constructor() {
    effect(() => {
      const u = this.authService.user();
      if (u) {
        this.phone.set(u.phone || '');
      }
    });

    effect((onCleanup) => {
      if (!this.authService.isReady() || !this.authService.user()) {
        return;
      }
      const sub = this.addressApi.list().subscribe({
        next: (list) => this.addresses.set(list),
        error: (err) => {
          console.error(err);
          alert('Could not load addresses.');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  toggleAdding(): void {
    this.isAdding.update((v) => !v);
  }

  setNewLabel(value: string): void {
    this.newAddress.update((a) => ({ ...a, label: value }));
  }

  setNewAddressLine(value: string): void {
    this.newAddress.update((a) => ({ ...a, address: value }));
  }

  submitAddress(ev: Event): void {
    ev.preventDefault();
    const u = this.authService.user();
    const na = this.newAddress();
    if (!u || !na.address || !na.label) return;
    const id = `ADDR-${Date.now()}`;
    this.addressApi.create({ id, address: na.address, label: na.label }).subscribe({
      next: (created) => {
        this.addresses.update((prev) => [...prev, created]);
        this.newAddress.set({ address: '', label: '' });
        this.isAdding.set(false);
      },
      error: (err) => {
        console.error(err);
        alert('Could not save address.');
      },
    });
  }

  toggleDefault(id: string): void {
    this.addressApi.setDefault(id).subscribe({
      next: (list) => this.addresses.set(list),
      error: (err) => {
        console.error(err);
        alert('Could not update default address.');
      },
    });
  }

  updatePhone(ev: Event): void {
    ev.preventDefault();
    const u = this.authService.user();
    const p = this.phone();
    if (!u || !p) return;
    this.isUpdatingPhone.set(true);
    this.http
      .patch<unknown>(`${environment.apiBaseUrl}/users/me`, { phone: p })
      .subscribe({
        next: () => {
          void this.authService.refreshUser();
          alert('Phone number updated successfully.');
        },
        error: (err) => {
          console.error(err);
          alert('Could not update phone.');
        },
        complete: () => this.isUpdatingPhone.set(false),
      });
  }
}
