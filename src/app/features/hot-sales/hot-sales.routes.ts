import { Routes } from '@angular/router';

export const HOT_SALES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./hot-sales.component').then((m) => m.HotSalesComponent),
  },
];
