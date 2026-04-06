import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        loadChildren: () =>
          import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
      },
      {
        path: 'shop',
        loadChildren: () =>
          import('./features/shop/shop.routes').then((m) => m.SHOP_ROUTES),
      },
      {
        path: 'product',
        loadChildren: () =>
          import('./features/product-detail/product-detail.routes').then(
            (m) => m.PRODUCT_DETAIL_ROUTES,
          ),
      },
      {
        path: 'cart',
        loadChildren: () =>
          import('./features/cart/cart.routes').then((m) => m.CART_ROUTES),
      },
      {
        path: 'checkout',
        loadChildren: () =>
          import('./features/checkout/checkout.routes').then(
            (m) => m.CHECKOUT_ROUTES,
          ),
      },
      {
        path: 'orders',
        loadChildren: () =>
          import('./features/orders/orders.routes').then((m) => m.ORDERS_ROUTES),
      },
      {
        path: 'hot-sales',
        loadChildren: () =>
          import('./features/hot-sales/hot-sales.routes').then(
            (m) => m.HOT_SALES_ROUTES,
          ),
      },
      {
        path: 'location',
        loadChildren: () =>
          import('./features/location/location.routes').then(
            (m) => m.LOCATION_ROUTES,
          ),
      },
      {
        path: 'profile',
        loadChildren: () =>
          import('./features/profile/profile.routes').then(
            (m) => m.PROFILE_ROUTES,
          ),
      },
      {
        path: 'login',
        loadChildren: () =>
          import('./features/auth/login.routes').then((m) => m.LOGIN_ROUTES),
      },
      {
        path: 'register',
        loadChildren: () =>
          import('./features/auth/register.routes').then(
            (m) => m.REGISTER_ROUTES,
          ),
      },
    ],
  },
];
