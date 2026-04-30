/** Minimum length for passwords (letters, numbers, symbols only; no spaces). */
export const PASSWORD_MIN_LENGTH = 3;

/** Printable ASCII excluding space (33–126): letters, digits, symbols. */
const PASSWORD_CHARS = /^[\x21-\x7E]+$/;

export function isValidPassword(value: string): boolean {
  if (!value) return false;
  if (/\s/.test(value)) return false;
  if (!PASSWORD_CHARS.test(value)) return false;
  return value.length >= PASSWORD_MIN_LENGTH;
}

/** Error message while typing, or null if empty or valid. */
export function passwordValidationMessage(value: string): string | null {
  if (!value) return null;
  if (/\s/.test(value)) {
    return 'Password cannot contain spaces.';
  }
  if (!PASSWORD_CHARS.test(value)) {
    return 'Use only letters, numbers, and symbols (no spaces).';
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}
