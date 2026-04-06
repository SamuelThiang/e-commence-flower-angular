import { Routes } from '@angular/router';

export const LOCATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./location.component').then((m) => m.LocationComponent),
  },
];
