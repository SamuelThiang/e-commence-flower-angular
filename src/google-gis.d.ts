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
            auto_select?: boolean;
            ux_mode?: 'popup' | 'redirect';
            login_uri?: string;
            cancel_on_tap_outside?: boolean;
            itp_support?: boolean;
            use_fedcm_for_prompt?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ): void;
          prompt(): void;
        };
      };
    };
  }
}
