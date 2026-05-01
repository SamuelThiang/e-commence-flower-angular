const FIELD_KEYS = new Set([
  'email',
  'password',
  'firstName',
  'lastName',
  'phone',
]);

/**
 * @param {string} message
 * @param {'email'|'password'|'firstName'|'lastName'|'phone'|undefined|null} field - FE shows under that input
 * @param {{ kind?: 'system'|'token' }} [opts] - When set, FE uses alert() (not inline)
 */
export function authErrorBody(message, field = undefined, opts = {}) {
  const body = { message };
  if (field && FIELD_KEYS.has(field)) {
    body.field = field;
  }
  if (opts.kind === 'system' || opts.kind === 'token') {
    body.kind = opts.kind;
  }
  return body;
}
