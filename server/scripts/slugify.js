/** URL-safe slug from display name (ASCII-ish). */
export function slugify(text) {
  const s = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'category';
}
