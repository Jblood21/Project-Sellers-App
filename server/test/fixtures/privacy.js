/**
 * The sign-in requires a privacy choice. A test that only needs a signed-in buyer gets one through this: `consent: true`
 * (the old way to agree to calls and texts) ticks the box, anything else takes the email-only terms, so what such a test
 * meant by "agreed" and "did not agree" still holds. One that is about the choice itself names `privacy` in the body
 * (`privacy: undefined` sends none).
 */
export function tickPrivacy(path, method, body) {
  const signingIn = method === 'POST' && /^\/api\/c\/[^/]+\/leads$/.test(path) && body && typeof body === 'object' && !('privacy' in body);
  return signingIn ? { ...body, privacy: body.consent === true ? 'agreed' : 'email_only' } : body;
}
