import { pinnedOrigin } from './ssr.js';

/**
 * Things a person who deploys this has to set, and what quietly goes wrong when
 * they have not. The app does not refuse to start for any of them (a local run
 * has none of them set), so each is said once in the log at boot, where the
 * owner looks first when something is off.
 */
export function bootWarnings(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const warnings = [];

  if (production && !String(env.PUBLIC_ORIGIN ?? '').trim()) {
    warnings.push(
      'PUBLIC_ORIGIN is not set. Set it to the one public address of the site (for example '
      + 'https://touradoor.com): canonical links, share previews and the links in emails use it. '
      + 'Until then they follow whichever address a visitor used.',
    );
  } else if (String(env.PUBLIC_ORIGIN ?? '').trim() && !pinnedOrigin(env.PUBLIC_ORIGIN)) {
    warnings.push(
      'PUBLIC_ORIGIN is set but is not a full http(s) address (it needs the https:// in front), '
      + 'so it is being ignored.',
    );
  }
  if (production && !env.SESSION_SECRET) {
    warnings.push(
      'SESSION_SECRET is not set. Every sign-in (builders and buyers) ends each time the server restarts.',
    );
  }
  if (production && !String(env.DATABASE_URL ?? '').trim()) {
    warnings.push(
      'DATABASE_URL is not set, so everything is being kept in a file on this server\'s own disk. '
      + 'That disk is erased on every deploy: leads, plans and uploads would be lost.',
    );
  }
  if (!env.RESEND_API_KEY) {
    warnings.push(
      'Email is off (RESEND_API_KEY is not set): call-request alerts to the builder and "email me my '
      + 'plan" to buyers are not sent. Requests are still saved.',
    );
  } else if (!env.EMAIL_FROM) {
    warnings.push(
      'EMAIL_FROM is not set, so mail is sent from onboarding@resend.dev, which Resend delivers only to '
      + 'the account owner. Buyers will not receive their plan until EMAIL_FROM is an address on a '
      + 'domain verified in Resend.',
    );
  }
  return warnings;
}
