import { Routes } from '@angular/router';
import { guestOnlyGuard } from '../../core/guest-only.guard';

export const REGISTER_ROUTES: Routes = [
  {
    path: '',
    canActivate: [guestOnlyGuard],
    loadComponent: () =>
      import('./register.component').then((m) => m.RegisterComponent),
  },
];
