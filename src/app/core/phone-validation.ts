export const REGISTRATION_PHONE_MIN_DIGITS = 9;
export const REGISTRATION_PHONE_MAX_DIGITS = 15;

/** Strip non-digits and cap length for the registration phone input. */
export function sanitizeRegistrationPhoneInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, REGISTRATION_PHONE_MAX_DIGITS);
}

/** Digits only, length 9–15 (matches server). */
export function isValidRegistrationPhone(raw: string): boolean {
  return /^\d{9,15}$/.test(raw);
}
