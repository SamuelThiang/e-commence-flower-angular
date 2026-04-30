export const environment = {
  production: true,
  apiBaseUrl: 'https://e-commence-flower-angular-production.up.railway.app/api',
  /**
   * Public base URL where product images are served long-term (CDN, S3 static website, etc.).
   * Relative paths in the DB like `/uploads/products/1.png` are resolved as `${mediaBaseUrl}/uploads/products/1.png`.
   * Railway container disk is ephemeral — point this at durable storage when you use uploads in production.
   */
  mediaBaseUrl: undefined as string | undefined,
  /** Paste your Web client ID from Google Cloud Console (must match server GOOGLE_CLIENT_ID). */
  googleClientId: '920596603488-78heh4ii7e6a1bhoqgkf4mt9fvs3hong.apps.googleusercontent.com',
};
