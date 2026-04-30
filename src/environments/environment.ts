export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  /** Optional base for relative product paths (`/uploads/...`). Defaults to API origin without `/api`. */
  mediaBaseUrl: undefined as string | undefined,
  /** Google OAuth Web client ID (same as Railway `GOOGLE_CLIENT_ID`). Leave empty to hide GIS button. */
  googleClientId: '920596603488-78heh4ii7e6a1bhoqgkf4mt9fvs3hong.apps.googleusercontent.com',
};
