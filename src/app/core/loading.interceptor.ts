import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { LoadingService } from './loading.service';
import { environment } from '../../environments/environment';

function shouldTrackLoading(req: HttpRequest<unknown>): boolean {
  return req.url.startsWith(environment.apiBaseUrl);
}

export const loadingInterceptor: HttpInterceptorFn = (
  req,
  next: HttpHandlerFn,
) => {
  if (!shouldTrackLoading(req)) {
    return next(req);
  }

  const loading = inject(LoadingService);
  loading.show();

  return next(req).pipe(finalize(() => loading.hide()));
};
