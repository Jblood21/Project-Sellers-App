/**
 * Business contacts an agent keeps on their account, so the same person is never typed twice. Today the kind is a
 * lender (the loan officer and company a listing's financing points to); a contact holds exactly the lender fields
 * a listing's settings hold, under the same keys, so using one is a straight copy onto the listing.
 */

export const CONTACT_MAX = 25;
export const CONTACT_LABEL_MAX = 80;
export const CONTACT_VALUE_MAX = 200;
/** A saved logo rides in the account row, so it is kept small, like the agent's portrait. */
export const CONTACT_LOGO_MAX_BYTES = 700 * 1024;

/** The lender fields a contact keeps, which are the listing settings that print on the flyer and the buyer page. */
export const LENDER_CONTACT_FIELDS = [
  'lenderName', 'lenderNmls', 'loName', 'loNmls', 'lenderPhone', 'lenderEmail', 'lenderWebsite', 'lenderAddress', 'loanApplicationUrl',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A contact from what a form sent: { data: { label, fields } } trimmed and checked, or { error } in words. The label
 * is what the picker shows; it falls back to the lender's name. A lender needs at least a name.
 */
export function cleanContact(body) {
  const fields = {};
  for (const key of LENDER_CONTACT_FIELDS) {
    const raw = body?.fields?.[key];
    if (raw === undefined || raw === null) { fields[key] = ''; continue; }
    if (typeof raw !== 'string') return { error: 'Type each detail as text.' };
    const value = raw.replace(/\u0000/g, '').trim();
    if (value.length > CONTACT_VALUE_MAX) return { error: `That ${key} is too long (up to ${CONTACT_VALUE_MAX} characters).` };
    fields[key] = value;
  }
  if (!fields.lenderName && !fields.loName) return { error: 'Give the lender a company name or a loan officer name.' };
  if (fields.lenderEmail && !EMAIL_RE.test(fields.lenderEmail)) return { error: 'Type a real email address.' };
  if (fields.loanApplicationUrl && !/^https?:\/\/\S+$/i.test(fields.loanApplicationUrl)) {
    return { error: 'The loan application link must be a web address starting with http:// or https://.' };
  }
  let label = typeof body?.label === 'string' ? body.label.replace(/\u0000/g, '').trim() : '';
  if (label.length > CONTACT_LABEL_MAX) return { error: `The name is too long (up to ${CONTACT_LABEL_MAX} characters).` };
  if (!label) label = [fields.loName, fields.lenderName].filter(Boolean).join(' · ').slice(0, CONTACT_LABEL_MAX);
  return { data: { label, fields } };
}

/** The saved contacts as stored, never throwing: a list of well-formed ones. */
export function contactsOf(stored) {
  if (!Array.isArray(stored)) return [];
  return stored.filter((c) => c && typeof c.id === 'string' && c.fields && typeof c.fields === 'object');
}
