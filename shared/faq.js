/**
 * The FAQ a community shows on its home screen.
 *
 * It is stored as one JSON string in a setting (`faqJson`) so it rides the same
 * save, defaults and public payload as everything else a builder edits in Setup,
 * and read through here so the server that stores it, the editor that writes it
 * and the screen that shows it all agree on its shape. Questions and answers are
 * plain text: they are rendered as text, never as markup.
 */

export const FAQ_MAX_ITEMS = 20;
export const FAQ_QUESTION_MAX = 200;
export const FAQ_ANSWER_MAX = 1500;
/** Room for every item at its longest, plus the JSON around them. */
export const FAQ_JSON_MAX = FAQ_MAX_ITEMS * (FAQ_QUESTION_MAX + FAQ_ANSWER_MAX + 40);

const clean = (value, max) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

/**
 * The usable items in a list. An entry whose question or answer is not text is
 * dropped, not coerced: `{x: 1}` printed as "[object Object]" in front of a buyer is
 * worse than a missing row.
 */
function cleanItems(list) {
  const items = [];
  if (!Array.isArray(list)) return items;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || typeof entry.q !== 'string' || typeof entry.a !== 'string') continue;
    const q = clean(entry.q, FAQ_QUESTION_MAX);
    const a = clean(entry.a, FAQ_ANSWER_MAX);
    // A question with no answer, or the reverse, is a half-finished edit.
    if (q && a) items.push({ q, a });
    if (items.length >= FAQ_MAX_ITEMS) break;
  }
  return items;
}

/**
 * The items in a stored value, in order, with anything unusable dropped. Never
 * throws: a hand-edited or truncated value is an FAQ with fewer items, not a
 * broken home screen.
 */
export function parseFaq(raw) {
  try {
    return cleanItems(JSON.parse(String(raw ?? '') || '[]'));
  } catch {
    return [];
  }
}

/** The string to store for a list of items. */
export function serializeFaq(items) {
  return JSON.stringify(cleanItems(items));
}

/**
 * What the server stores for a submitted value: the same string, normalised, or
 * null when it is not a list at all (so a bad request is refused instead of
 * quietly emptying the FAQ). A value nested so deeply that it cannot be read is
 * refused too, rather than crashing the request.
 */
export function normalizeFaqJson(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '[]';
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? serializeFaq(parsed) : null;
  } catch {
    return null;
  }
}
