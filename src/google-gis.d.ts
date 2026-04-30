export {};

/** Google Identity Services (`accounts.google.com/gsi/client`). */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ): void;
        };
      };
    };
  }
}
