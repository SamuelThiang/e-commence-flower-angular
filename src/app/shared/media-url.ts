import { environment } from '../../environments/environment';

/** API server origin without trailing `/api` (dev fallback for relative image paths). */
export function apiOriginWithoutApiPath(): string {
  return environment.apiBaseUrl.replace(/\/?api\/?$/i, '').replace(/\/$/, '');
}

/**
 * Builds a browser-ready image URL.
 * - Absolute `http(s):` URLs (e.g. seeded catalog) are unchanged.
 * - Relative paths from the API (e.g. `/uploads/products/1.png`) use `environment.mediaBaseUrl`
 *   when set (durable CDN/S3), otherwise the API origin without `/api`.
 */
export function resolveProductImageUrl(src: string | null | undefined): string {
  if (src == null || src === '') return '';
  const s = src.trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = (environment.mediaBaseUrl?.trim() || apiOriginWithoutApiPath()).replace(
    /\/$/,
    '',
  );
  const path = s.startsWith('/') ? s : `/${s}`;
  return `${base}${path}`;
}
