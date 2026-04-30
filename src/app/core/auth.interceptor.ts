import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

const TOKEN_KEY = 'flower_auth_token';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};

export { TOKEN_KEY };
