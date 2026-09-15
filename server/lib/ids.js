import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

/** Short, URL-safe, human-typable id. Used for community ids so QR links stay short. */
export function shortId(len = 8) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Slug from a name, with a short suffix so community URLs read well but never collide. */
export function slugId(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return (base || 'community') + '-' + shortId(4);
}

export function uuid() {
  return randomBytes(16).toString('hex');
}
