/**
 * An agent's own details, kept on their account so every listing they make starts filled in: the name and number
 * buyers are shown to call, the email, the brokerage and the licence line. (The portrait is kept beside these on the
 * account, not here: it is an image.) Used by the server, which stores and checks them, and the admin's forms.
 */

export const PROFILE_TEXT_MAX = { name: 80, phone: 40, email: 120, brokerage: 120, license: 120 };
export const PROFILE_FIELDS = Object.keys(PROFILE_TEXT_MAX);

/** The most a stored portrait may weigh (decoded): it rides in the account row, so it is kept small. */
export const PROFILE_PHOTO_MAX_BYTES = 700 * 1024;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The profile fields in `body` that are present, trimmed and checked: { data } holding only those, or { error } in
 * words. A blank value clears a field. An email that is typed has to be one address.
 */
export function cleanProfile(body) {
  const data = {};
  for (const key of PROFILE_FIELDS) {
    if (body?.[key] === undefined || body?.[key] === null) continue;
    if (typeof body[key] !== 'string') return { error: `Type your ${key === 'license' ? 'licence' : key} as text.` };
    const value = body[key].replace(/\u0000/g, '').trim();
    if (value.length > PROFILE_TEXT_MAX[key]) return { error: `Your ${key === 'license' ? 'licence' : key} is too long (up to ${PROFILE_TEXT_MAX[key]} characters).` };
    data[key] = value;
  }
  if (data.email && !EMAIL_RE.test(data.email)) return { error: 'Type a real email address.' };
  return { data };
}

/** The profile as stored, with every field present (blank when never set). Never throws. */
export function profileOf(stored) {
  const out = {};
  for (const key of PROFILE_FIELDS) out[key] = typeof stored?.[key] === 'string' ? stored[key] : '';
  return out;
}
