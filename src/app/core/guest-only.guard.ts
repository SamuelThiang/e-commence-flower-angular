import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

/** Blocks navigation when already signed in (e.g. typing `/login` or `/register` in the bar). */
export const guestOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await firstValueFrom(
    toObservable(auth.isReady).pipe(filter(Boolean), take(1)),
  );

  const user = auth.user();
  if (!user) {
    return true;
  }
  if (!user.phone?.trim()) {
    return router.createUrlTree(['/profile']);
  }
  return router.createUrlTree(['/home']);
};
