import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, afterEach, before, describe, test } from 'node:test';

import {
  forgetAdminSessions, hashPassword, hashResetToken, issueToken, readToken, unusablePasswordHash, verifyPassword,
} from '../lib/auth.js';
import { setTransportForTests } from '../lib/email.js';
import { ensureAdmin } from '../index.js';
import { backends, startBackend } from './fixtures/harness.js';

// The limits are off under `node --test`; the tests of them at the end turn them on for themselves.
delete process.env.RATE_LIMITS;

const LINK = /\/admin\/reset\?token=([A-Za-z0-9_-]+)/;
const ADMIN = 'admin@test.co';
const BAD_LINK = 'That link has expired or was already used. Ask for a new one.';

for (const kind of backends()) {
  describe(`password reset and change (${kind} store)`, () => {
    let app;
    let api;
    let store;
    let sent;
    let restoreMail = () => {};
    // The password as it stands, so each test can sign in whatever the one before it did.
    let current = 'pw123456';

    const login = (email, password) => api('/api/admin/login', { method: 'POST', body: { email, password } });
    const forgot = (email, headers = {}) => api('/api/admin/password/forgot', { method: 'POST', body: { email }, headers });
    const reset = (token, password) => api('/api/admin/password/reset', { method: 'POST', body: { token, password } });
    /** Asks for a link for the admin and reads the token out of the one email that went. */
    const freshToken = async () => {
      sent.length = 0;
      assert.equal((await forgot(ADMIN)).status, 200);
      assert.equal(sent.length, 1, 'one email went');
      const match = LINK.exec(sent[0].text);
      assert.ok(match, 'and it carries the reset link');
      return match[1];
    };

    before(async () => {
      app = await startBackend(kind, 'password_reset');
      ({ api, store } = app);
      sent = [];
      restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
      process.env.RESEND_API_KEY = 'test-key';
    });
    after(async () => {
      restoreMail();
      delete process.env.RESEND_API_KEY;
      delete process.env.RATE_LIMITS;
      await app.stop();
    });
    afterEach(() => { sent.length = 0; });

    test('an unknown address gets the same answer and no email', async () => {
      const unknown = await forgot('nobody@test.co');
      assert.equal(unknown.status, 200);
      assert.match(unknown.body.message, /If that address has an account/);
      assert.equal(sent.length, 0);

      const known = await forgot(ADMIN);
      assert.equal(known.status, 200);
      assert.deepEqual(known.body, unknown.body, 'word for word the same answer');
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0].to, [ADMIN]);
      assert.equal(sent[0].subject, 'Reset your Touradoor password');
      assert.match(sent[0].text, /works once, for 30 minutes/);
      assert.match(sent[0].text, /did not ask for this, ignore it/);
      const token = LINK.exec(sent[0].text)?.[1];
      assert.ok(token && token.length >= 40, 'the link carries a long random token');
      // The link is built from the Host header here (no PUBLIC_ORIGIN in a test), so it points back at this server.
      assert.match(sent[0].text, /http:\/\/127\.0\.0\.1:\d+\/admin\/reset\?token=/);
      // Only the hash is kept.
      const row = await store.getPasswordReset(hashResetToken(token));
      assert.ok(row, 'the store finds the link by the hash of its token');
      assert.equal(row.tokenHash, undefined, 'and hands back nothing that could rebuild the link');
      assert.equal(await store.getPasswordReset(token), null, 'the raw token finds nothing');
    });

    test('a blank or impossible address is refused without a lookup', async () => {
      assert.equal((await forgot('')).status, 400);
      assert.equal((await forgot('not-an-address')).status, 400);
      assert.equal(sent.length, 0);
    });

    test('with email switched off the answer is the same and nothing goes out', async () => {
      delete process.env.RESEND_API_KEY;
      try {
        const res = await forgot(ADMIN);
        assert.equal(res.status, 200);
        assert.match(res.body.message, /If that address has an account/);
        assert.equal(sent.length, 0);
      } finally {
        process.env.RESEND_API_KEY = 'test-key';
      }
    });

    test('a made-up token is refused with the one message', async () => {
      const res = await reset('definitely-not-a-token', 'a-fine-new-password');
      assert.equal(res.status, 400);
      assert.equal(res.body.error, BAD_LINK);
      assert.equal((await reset('', 'a-fine-new-password')).status, 400);
      assert.equal((await api('/api/admin/password/reset', { method: 'POST', body: { password: 'a-fine-new-password' } })).status, 400);
    });

    test('an expired token is refused', async () => {
      const admin = await store.getAdminByEmail(ADMIN);
      const token = 'expired-token-for-the-test';
      await store.createPasswordReset({ adminId: admin.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() - 1000) });
      const res = await reset(token, 'a-fine-new-password');
      assert.equal(res.status, 400);
      assert.equal(res.body.error, BAD_LINK);
      assert.equal((await login(ADMIN, 'a-fine-new-password')).status, 401, 'and the password did not change');
    });

    test('a weak password is refused and the link is still good', async () => {
      const token = await freshToken();
      const short = await reset(token, 'short');
      assert.equal(short.status, 400);
      assert.equal(short.body.error, 'Use at least 10 characters.');
      assert.equal((await reset(token, 123456789012)).status, 400, 'a number is not a password');
      const ok = await reset(token, 'exactly10!');
      assert.equal(ok.status, 200, 'ten characters is enough');
      current = 'exactly10!';
    });

    test('asking again invalidates the earlier link', async () => {
      const first = await freshToken();
      const second = await freshToken();
      assert.notEqual(first, second);
      const stale = await reset(first, 'a-fine-new-password');
      assert.equal(stale.status, 400);
      assert.equal(stale.body.error, BAD_LINK);
      assert.equal((await reset(second, 'a-fine-new-password')).status, 200, 'the newest link works');
      current = 'a-fine-new-password';
    });

    test('a used link cannot be used twice, and the new password signs in while the old does not', async () => {
      const before = await login(ADMIN, current);
      assert.equal(before.status, 200);
      const oldSession = before.body.token;
      assert.equal((await api('/api/admin/me', { token: oldSession })).status, 200);

      const token = await freshToken();
      const done = await reset(token, 'brand-new-password');
      assert.equal(done.status, 200);
      assert.equal(done.body.admin.email, ADMIN);
      assert.ok(done.body.token, 'answers with a session');
      assert.equal(readToken(done.body.token).email, ADMIN);

      const again = await reset(token, 'another-password-1');
      assert.equal(again.status, 400);
      assert.equal(again.body.error, BAD_LINK);

      assert.equal((await login(ADMIN, current)).status, 401, 'the old password is dead');
      assert.equal((await login(ADMIN, 'another-password-1')).status, 401, 'the second try did not land');
      const fresh = await login(ADMIN, 'brand-new-password');
      assert.equal(fresh.status, 200, 'the new password signs in');
      current = 'brand-new-password';

      // Whoever was signed in with the old password is signed out; the session the reset issued works.
      const stale = await api('/api/admin/me', { token: oldSession });
      assert.equal(stale.status, 401);
      assert.equal((await api('/api/admin/communities', { token: oldSession })).status, 401, 'everywhere, not only /me');
      assert.equal((await api('/api/admin/me', { token: done.body.token })).status, 200);
      assert.equal((await api('/api/admin/me', { token: fresh.body.token })).status, 200);
      const admin = await store.getAdminByEmail(ADMIN);
      assert.ok(admin.password_changed_at, 'the change is stamped on the account');
    });

    test('a session check already on its way when the password changes cannot keep the old session alive', async () => {
      // requireAdmin keeps each admin's password_changed_at for 30 seconds; the request below has to miss that, as
      // one on a cold instance (or 30 seconds after the last) would.
      const admin = await store.getAdminByEmail(ADMIN);
      const oldSession = (await login(ADMIN, current)).body.token;
      forgetAdminSessions(admin.id);
      // The first row read is held back until the reset below has been written, and answers with the row as it
      // stood when it was read: what a slow Postgres round trip looks like from the server's side. Every later read
      // answers at once, with the live row, so the reset itself runs as usual.
      const original = store.getAdminById;
      let readStarted;
      const firstRead = new Promise((resolve) => { readStarted = resolve; });
      let releaseRead;
      const held = new Promise((resolve) => { releaseRead = resolve; });
      let reads = 0;
      store.getAdminById = async function slowFirstRead(id) {
        const row = await original.call(this, id);
        if (reads++ > 0) return row;
        const asRead = row && { ...row };
        readStarted();
        await held;
        return asRead;
      };
      try {
        const inFlight = api('/api/admin/me', { token: oldSession });
        await firstRead;
        const done = await reset(await freshToken(), 'raced-new-password');
        assert.equal(done.status, 200);
        current = 'raced-new-password';
        releaseRead();
        assert.equal((await inFlight).status, 401, 'the request whose row was read before the change is refused');
        assert.equal((await api('/api/admin/me', { token: oldSession })).status, 401, 'and so is the next one: the old row was not kept');
        assert.equal((await api('/api/admin/me', { token: done.body.token })).status, 200, 'the session the reset issued works');
      } finally {
        store.getAdminById = original;
      }
    });

    test('a token from before issue times were recorded is dead once the password has changed', async () => {
      const admin = await store.getAdminByEmail(ADMIN);
      const body = JSON.parse(Buffer.from(issueToken(admin).split('.')[0], 'base64url').toString('utf8'));
      assert.ok(body.iat, 'tokens carry when they were issued');
      // The shape an earlier release issued: no `iat`, a live `exp`, signed with the same secret (the harness sets it).
      const legacyToken = (who) => {
        const payload = Buffer.from(JSON.stringify({ typ: 'admin', sub: who.id, email: who.email, exp: Date.now() + 60_000 }))
          .toString('base64url');
        return `${payload}.${createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url')}`;
      };
      const legacy = legacyToken(admin);
      assert.ok(readToken(legacy), 'the server reads it as a token');
      assert.equal(readToken(legacy).iat, undefined, 'and it carries no issue time');
      assert.equal((await api('/api/admin/me', { token: legacy })).status, 401, 'this account changed its password above');
      // An account that never changed its password still takes one.
      const untouched = await store.createAdmin({ email: 'untouched@test.co', passwordHash: hashPassword('never-changed-1') });
      assert.equal((await api('/api/admin/me', { token: legacyToken(untouched) })).status, 200);
    });

    test('change password: the right current password changes it and keeps this tab signed in', async () => {
      const first = (await login(ADMIN, current)).body.token;
      const other = (await login(ADMIN, current)).body.token;
      const change = await api('/api/admin/password/change', {
        method: 'POST', token: first, body: { currentPassword: current, password: 'changed-in-the-app' },
      });
      assert.equal(change.status, 200);
      assert.ok(change.body.token);
      assert.equal(change.body.admin.email, ADMIN);
      assert.equal((await api('/api/admin/me', { token: change.body.token })).status, 200, 'the session the change issued works');
      assert.equal((await api('/api/admin/me', { token: first })).status, 401, 'the tab\'s old token is replaced');
      assert.equal((await api('/api/admin/me', { token: other })).status, 401, 'the other device is signed out');
      assert.equal((await login(ADMIN, current)).status, 401);
      assert.equal((await login(ADMIN, 'changed-in-the-app')).status, 200);
      current = 'changed-in-the-app';
    });

    test('change password: a wrong current password or a weak new one changes nothing', async () => {
      const token = (await login(ADMIN, current)).body.token;
      const wrong = await api('/api/admin/password/change', {
        method: 'POST', token, body: { currentPassword: 'not-it-at-all', password: 'another-fine-password' },
      });
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.error, 'That is not your current password.');
      const weak = await api('/api/admin/password/change', {
        method: 'POST', token, body: { currentPassword: current, password: 'tiny' },
      });
      assert.equal(weak.status, 400);
      assert.equal(weak.body.error, 'Use at least 10 characters.');
      assert.equal((await api('/api/admin/me', { token })).status, 200, 'this session is untouched');
      assert.equal((await login(ADMIN, current)).status, 200, 'and so is the password');
      assert.equal((await api('/api/admin/password/change', { method: 'POST', body: { currentPassword: current, password: 'x'.repeat(12) } })).status, 401, 'signed out callers cannot');
    });

    describe('the Render fallback (ADMIN_PASSWORD at boot)', () => {
      const BOOT = 'boot@test.co';
      const withEnv = async (password, fn, email = BOOT) => {
        const was = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
        process.env.ADMIN_EMAIL = email;
        process.env.ADMIN_PASSWORD = password;
        try {
          await ensureAdmin(store);
          return await fn();
        } finally {
          if (was.email === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = was.email;
          if (was.password === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = was.password;
        }
      };

      test('creates the account, applies a new value once, and leaves an in-app change alone', async () => {
        await withEnv('first-boot-pw', async () => {
          const admin = await store.getAdminByEmail(BOOT);
          assert.ok(admin, 'created from the environment');
          assert.equal(admin.password_changed_at ?? null, null, 'a new account has not changed its password');
          assert.equal((await login(BOOT, 'first-boot-pw')).status, 200);
        });
        const session = (await login(BOOT, 'first-boot-pw')).body.token;

        // The same value on the next boot (the variable stays set in the dashboard) changes nothing and ends no session.
        await withEnv('first-boot-pw', async () => {
          assert.equal((await store.getAdminByEmail(BOOT)).password_changed_at ?? null, null);
          assert.equal((await api('/api/admin/me', { token: session })).status, 200);
        });

        // The owner changes it in the app; a boot with the old environment value still set leaves the new one in place.
        const changed = await api('/api/admin/password/change', {
          method: 'POST', token: session, body: { currentPassword: 'first-boot-pw', password: 'chosen-in-the-app' },
        });
        assert.equal(changed.status, 200);
        await withEnv('first-boot-pw', async () => {
          assert.equal((await login(BOOT, 'chosen-in-the-app')).status, 200, 'the in-app password survives the deploy');
          assert.equal((await login(BOOT, 'first-boot-pw')).status, 401);
          assert.equal((await api('/api/admin/me', { token: changed.body.token })).status, 200, 'and so does its session');
        });

        // A NEW value in the dashboard is the reset: it applies, it is stamped, and the old sessions end.
        await withEnv('typed-in-render-1', async () => {
          const admin = await store.getAdminByEmail(BOOT);
          assert.ok(verifyPassword('typed-in-render-1', admin.password_hash));
          assert.ok(admin.password_changed_at, 'stamped as a change');
          assert.equal((await login(BOOT, 'typed-in-render-1')).status, 200);
          assert.equal((await login(BOOT, 'chosen-in-the-app')).status, 401);
          assert.equal((await api('/api/admin/me', { token: changed.body.token })).status, 401, 'the old session is over');
          assert.equal((await api('/api/admin/me', { token: (await login(BOOT, 'typed-in-render-1')).body.token })).status, 200);
        });
      });

      test('an invited account whose address is then put in ADMIN_EMAIL gets the password and stops being invited', async () => {
        const INVITED = 'invited-boot@test.co';
        const row = await store.createAdmin({ email: INVITED, passwordHash: unusablePasswordHash(), invitedAt: new Date() });
        assert.ok((await store.getAdminById(row.id)).invited_at, 'waiting on its invite');
        await withEnv('typed-in-render-2', async () => {
          const admin = await store.getAdminByEmail(INVITED);
          assert.equal(admin.invited_at ?? null, null, 'no longer waiting: the environment set its password');
          assert.ok(admin.password_changed_at, 'stamped as a change');
          assert.equal((await login(INVITED, 'typed-in-render-2')).status, 200);
          // The owner's session as it stands now: the tests above changed that password more than once.
          const session = (await login(ADMIN, current)).body.token;
          const listed = (await api('/api/admin/team', { token: session })).body.find((m) => m.email === INVITED);
          assert.equal(listed.passwordSet, true, 'and the Team page lists it as joined, not invited');
          assert.equal(listed.bootstrap, true);
        }, INVITED);
      });
    });

    describe('with the limits on', () => {
      before(() => { process.env.RATE_LIMITS = 'on'; });
      after(() => { delete process.env.RATE_LIMITS; });

      test('three reset requests per inbox and ten per visitor in 15 minutes', async () => {
        // Dressing the address up does not get round the inbox count.
        for (const email of ['someone@limit.test', 'Someone+1@limit.test', 'someone+2@LIMIT.test']) {
          assert.equal((await forgot(email)).status, 200, email);
        }
        const fourth = await forgot('someone@limit.test');
        assert.equal(fourth.status, 429);
        assert.match(fourth.body.error, /Too many reset requests/);
        assert.ok(Number(fourth.headers.get('retry-after')) > 0, 'it says when to come back');
        // Other inboxes are fine until the visitor's own count runs out: 10 in all, 3 used (the refusal did not count).
        for (let n = 0; n < 7; n += 1) assert.equal((await forgot(`other${n}@limit.test`)).status, 200, `request ${n + 4}`);
        const eleventh = await forgot('another@limit.test');
        assert.equal(eleventh.status, 429);
        assert.equal(sent.length, 0, 'none of those addresses has an account, so nothing went out');
        // A different visitor is not stopped by this one's count.
        assert.equal((await forgot('another@limit.test', { 'X-Forwarded-For': '203.0.113.9' })).status, 200);
      });

      test('ten reset attempts per visitor in 15 minutes', async () => {
        for (let n = 0; n < 10; n += 1) {
          assert.equal((await reset(`guess-${n}`, 'a-fine-new-password')).status, 400);
        }
        const stopped = await reset('guess-11', 'a-fine-new-password');
        assert.equal(stopped.status, 429);
        assert.ok(Number(stopped.headers.get('retry-after')) > 0);
      });

      test('wrong current passwords count like wrong sign-ins', async () => {
        const token = (await login(ADMIN, current, { 'X-Forwarded-For': '198.51.100.7' })).body.token;
        const wrong = () => api('/api/admin/password/change', {
          method: 'POST', token, body: { currentPassword: 'nope', password: 'a-fine-new-password' }, headers: { 'X-Forwarded-For': '198.51.100.7' },
        });
        for (let n = 0; n < 8; n += 1) assert.equal((await wrong()).status, 400, `attempt ${n + 1}`);
        const locked = await wrong();
        assert.equal(locked.status, 429);
        assert.match(locked.body.error, /Too many password attempts/);
        assert.ok(Number(locked.headers.get('retry-after')) > 0);
      });
    });
  });
}
