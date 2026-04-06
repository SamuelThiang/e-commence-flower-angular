import { Routes } from '@angular/router';

export const PRODUCT_DETAIL_ROUTES: Routes = [
  {
    path: ':id',
    loadComponent: () =>
      import('./product-detail.component').then(
        (m) => m.ProductDetailComponent,
      ),
  },
];
