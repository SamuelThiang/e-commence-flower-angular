import { Routes } from '@angular/router';
import { guestOnlyGuard } from '../../core/guest-only.guard';

export const LOGIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [guestOnlyGuard],
    loadComponent: () =>
      import('./login.component').then((m) => m.LoginComponent),
  },
];
