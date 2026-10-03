/**
 * Path parameters are decoded before a handler sees them, so a request for
 * /api/c/%00 arrives as an id containing a NUL byte. Postgres refuses a NUL in
 * any text value and throws, which would otherwise surface as a 500 (and, in a
 * handler nobody wrapped, as a process-ending unhandled rejection) for an
 * address that can only ever mean "no such thing". No id, slug or key this app
 * issues contains a control character, so one is answered with the same 404 as
 * any other address that does not exist, before it can reach a query.
 */
// eslint-disable-next-line no-control-regex -- control characters are the thing being matched.
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Whether `value` holds a control character (a NUL above all). */
export const hasControlCharacter = (value) => CONTROL.test(String(value ?? ''));

const PARAMS = ['id', 'communityId', 'slug', 'kind', 'key'];

/** Registers the guard for every path parameter name this app uses. */
export function rejectControlCharacters(target) {
  for (const name of PARAMS) {
    target.param(name, (_req, res, next, value) => {
      if (hasControlCharacter(value)) return res.status(404).json({ error: 'Not found' });
      return next();
    });
  }
  return target;
}
