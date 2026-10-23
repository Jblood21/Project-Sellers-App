import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';

import { INVITE_TTL_MS, hashPassword, hashResetToken, verifyPassword } from '../lib/auth.js';
import { setTransportForTests } from '../lib/email.js';
import { backends, startBackend } from './fixtures/harness.js';

// The limits are off under `node --test`; the tests of them at the end turn them on for themselves.
delete process.env.RATE_LIMITS;

const LINK = /\/admin\/reset\?token=([A-Za-z0-9_-]+)&invite=1/;
const OWNER = 'admin@test.co';
const BAD_LINK = 'That link has expired or was already used. Ask for a new one.';
const DAY_MS = 24 * 60 * 60 * 1000;

for (const kind of backends()) {
  describe(`the team: several admins, invited by email (${kind} store)`, () => {
    let app;
    let api;
    let store;
    let owner; // the bootstrap account's session
    let sent;
    let restoreMail = () => {};

    const team = (token = owner) => api('/api/admin/team', { token });
    const invite = (email, { token = owner, headers = {} } = {}) =>
      api('/api/admin/team/invites', { method: 'POST', body: { email }, token, headers });
    const resend = (id, { token = owner, headers = {} } = {}) =>
      api(`/api/admin/team/invites/${encodeURIComponent(id)}/resend`, { method: 'POST', body: {}, token, headers });
    const remove = (id, token = owner) => api(`/api/admin/team/${encodeURIComponent(id)}`, { method: 'DELETE', token });
    const reset = (token, password) => api('/api/admin/password/reset', { method: 'POST', body: { token, password } });
    const login = (email, password) => api('/api/admin/login', { method: 'POST', body: { email, password } });
    const forgot = (email) => api('/api/admin/password/forgot', { method: 'POST', body: { email } });
    /** The set-password token out of the one invitation that went to `email`. */
    const tokenSentTo = (email) => {
      const mail = sent.filter((m) => m.to[0] === email);
      assert.equal(mail.length, 1, `one email went to ${email}`);
      const match = LINK.exec(mail[0].text);
      assert.ok(match, 'and it carries the set-password link');
      return match[1];
    };

    before(async () => {
      app = await startBackend(kind, 'admin_team');
      ({ api, store, token: owner } = app);
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

    test('needs an admin', async () => {
      assert.equal((await api('/api/admin/team')).status, 401);
      assert.equal((await invite('x@test.co', { token: 'nonsense' })).status, 401);
      assert.equal((await remove('anything', 'nonsense')).status, 401);
    });

    test('lists the one account, without its hashes', async () => {
      const res = await team();
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      const [me] = res.body;
      assert.equal(me.email, OWNER);
      assert.ok(me.id && me.createdAt, 'id and when it was made');
      assert.equal(me.invitedAt, null);
      assert.equal(me.passwordSet, true);
      assert.equal(me.bootstrap, false, 'ADMIN_EMAIL is not set here, so no account is made at boot');
      assert.deepEqual(Object.keys(me).sort(), ['bootstrap', 'createdAt', 'email', 'id', 'invitedAt', 'passwordSet']);
    });

    test('an invite makes the account with a password nobody can use, sends one 7-day link and marks the row', async () => {
      const res = await invite('Ridge@Test.co');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.sent, true);
      assert.equal(res.body.admin.email, 'ridge@test.co', 'lower-cased');
      assert.equal(res.body.admin.passwordSet, false);
      assert.ok(res.body.admin.invitedAt, 'marked invited');
      assert.equal(res.body.admin.password_hash, undefined, 'no hash in the answer');

      const row = await store.getAdminByEmail('ridge@test.co');
      assert.ok(row, 'the row exists');
      assert.ok(row.invited_at, 'and is marked invited');
      assert.equal(row.password_changed_at ?? null, null);
      assert.match(row.password_hash, /^scrypt\$/, 'a real hash, so a sign-in attempt is checked like any other');
      assert.equal(verifyPassword('', row.password_hash), false);
      assert.equal((await login('ridge@test.co', '')).status, 401, 'nothing typed into the form matches it');
      assert.equal((await login('ridge@test.co', 'password12')).status, 401);

      assert.equal(sent.length, 1, 'one email went');
      assert.deepEqual(sent[0].to, ['ridge@test.co']);
      assert.equal(sent[0].subject, 'You have been invited to Touradoor');
      assert.match(sent[0].text, new RegExp(`${OWNER} invited you`), 'says who asked');
      assert.match(sent[0].text, /Touradoor/);
      assert.match(sent[0].text, /works once, for 7 days/);
      assert.match(sent[0].text, /Set your password to get in/);
      assert.match(sent[0].text, /http:\/\/127\.0\.0\.1:\d+\/admin\/reset\?token=[A-Za-z0-9_-]{40,}&invite=1/, 'the link, with the wording hint');
      const token = tokenSentTo('ridge@test.co');
      const link = await store.getPasswordReset(hashResetToken(token));
      assert.ok(link, 'the store knows the link by the hash of its token');
      assert.equal(link.adminId, row.id);
      const ttl = new Date(link.expiresAt).getTime() - Date.now();
      assert.ok(ttl > INVITE_TTL_MS - 60_000 && ttl <= INVITE_TTL_MS, `good for about seven days (${ttl} ms)`);
      assert.ok(ttl > 6.9 * DAY_MS, 'not the thirty minutes of a forgot link');

      const list = await team();
      assert.equal(list.body.length, 2);
      assert.equal(list.body[0].email, OWNER, 'the owner first');
      assert.equal(list.body[1].email, 'ridge@test.co');
      assert.equal(list.body[1].passwordSet, false);
    });

    test('the invite link sets the password, signs the person in and clears the mark', async () => {
      assert.equal((await invite('dillan@test.co')).status, 200);
      const token = tokenSentTo('dillan@test.co');
      const weak = await reset(token, 'short');
      assert.equal(weak.status, 400, 'the usual password rule');
      const done = await reset(token, 'dillans-password-1');
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(done.body.admin.email, 'dillan@test.co');
      assert.ok(done.body.token, 'signed in');
      assert.equal((await api('/api/admin/me', { token: done.body.token })).status, 200);
      assert.equal((await reset(token, 'another-password-1')).status, 400, 'the link worked once');

      const row = await store.getAdminByEmail('dillan@test.co');
      assert.equal(row.invited_at ?? null, null, 'no longer invited');
      assert.ok(row.password_changed_at, 'the password is stamped as set');
      assert.equal((await login('dillan@test.co', 'dillans-password-1')).status, 200);
      const listed = (await team()).body.find((m) => m.email === 'dillan@test.co');
      assert.equal(listed.passwordSet, true);
      assert.equal(listed.invitedAt, null);
      // The new admin is equal to the owner: they see the team and can invite too.
      assert.equal((await team(done.body.token)).status, 200);
      assert.equal((await invite('fourth@test.co', { token: done.body.token })).status, 200);
      assert.match(sent.at(-1).text, /dillan@test\.co invited you/);
    });

    test('an address that already has access is refused, however it is typed', async () => {
      for (const email of [OWNER, ' Admin@TEST.co ', 'ridge@test.co', 'dillan@test.co']) {
        const res = await invite(email);
        assert.equal(res.status, 400, email);
        assert.equal(res.body.error, 'That address already has access.');
      }
      assert.equal(sent.length, 0);
      assert.equal((await team()).body.length, 4, 'nothing was added');
    });

    test('an address that is not one is refused before anything is made', async () => {
      for (const email of ['', 'nope', 'no-at-sign.test.co', 'no@dot', 'two@@test.co', `${'a'.repeat(250)}@test.co`, 'ctl\u0001@test.co', 'sp ace@test.co']) {
        const res = await invite(email);
        assert.equal(res.status, 400, JSON.stringify(email));
        assert.equal(res.body.error, 'Enter a full email address, like name@example.com.');
      }
      assert.equal((await api('/api/admin/team/invites', { method: 'POST', body: {}, token: owner })).status, 400, 'no address at all');
      assert.equal((await api('/api/admin/team/invites', { method: 'POST', body: { email: 42 }, token: owner })).status, 400);
      assert.equal(sent.length, 0);
      assert.equal((await team()).body.length, 4);
    });

    test('resend replaces the link, and only for an account that has not set its password', async () => {
      assert.equal((await invite('again@test.co')).status, 200);
      const first = tokenSentTo('again@test.co');
      const { id } = (await team()).body.find((m) => m.email === 'again@test.co');
      sent.length = 0;

      const res = await resend(id);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.sent, true);
      assert.equal(res.body.admin.passwordSet, false);
      assert.equal(sent.length, 1, 'the invitation went again');
      assert.equal(sent[0].subject, 'You have been invited to Touradoor');
      assert.match(sent[0].text, new RegExp(`${OWNER} invited you`));
      const second = tokenSentTo('again@test.co');
      assert.notEqual(second, first);
      const stale = await reset(first, 'a-fine-new-password');
      assert.equal(stale.status, 400, 'the earlier link is dead');
      assert.equal(stale.body.error, BAD_LINK);
      assert.equal((await reset(second, 'a-fine-new-password')).status, 200, 'the newest one works');

      const settled = await resend(id);
      assert.equal(settled.status, 400, 'nothing to resend once the password is set');
      assert.equal(settled.body.error, 'They have already set a password, so there is nothing to resend.');
      assert.equal((await resend('no-such-admin')).status, 404);
      assert.equal(sent.length, 1, 'neither sent anything');
    });

    test('with email off the account is still made and the answer says why nothing went', async () => {
      delete process.env.RESEND_API_KEY;
      let res;
      try {
        res = await invite('quiet@test.co');
      } finally {
        process.env.RESEND_API_KEY = 'test-key';
      }
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.sent, false);
      assert.match(res.body.reason, /RESEND_API_KEY/);
      assert.match(res.body.reason, /Resend invite/, 'and what to do about it');
      assert.equal(sent.length, 0);
      const row = await store.getAdminByEmail('quiet@test.co');
      assert.ok(row?.invited_at, 'the row is there, marked invited');
      // Once email is on, Resend invite is the way to get the link out.
      const again = await resend(row.id);
      assert.equal(again.status, 200);
      assert.equal(again.body.sent, true);
      assert.ok(tokenSentTo('quiet@test.co'));
    });

    test('a provider failure is reported in the answer, not hidden in a log', async () => {
      const restore = setTransportForTests(async () => { throw new Error('Resend responded 422: domain not verified'); });
      let res;
      try {
        res = await invite('unlucky@test.co');
      } finally {
        restore();
      }
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.sent, false);
      assert.equal(res.body.reason, 'Resend responded 422: domain not verified');
      assert.ok((await store.getAdminByEmail('unlucky@test.co'))?.invited_at, 'the account exists all the same');
    });

    test('you cannot remove yourself', async () => {
      const me = (await api('/api/admin/me', { token: owner })).body;
      const res = await remove(me.id);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'You cannot remove yourself. Ask another admin to.');
      assert.equal((await api('/api/admin/me', { token: owner })).status, 200, 'still here');
    });

    test('the last admin cannot be removed', async () => {
      // Through the route the rule is out of reach on purpose: you cannot remove yourself, so the account you can
      // remove is never the last. Two admins removing each other at the same moment are the one way to it (the
      // last test here), so the store, which holds the rule, is asked straight: everyone but the owner goes, and
      // then the owner cannot.
      for (const other of (await store.listAdmins()).filter((a) => a.email !== OWNER)) {
        assert.equal(await store.deleteAdmin(other.id), true, other.email);
      }
      const [last] = await store.listAdmins();
      assert.equal(last.email, OWNER);
      assert.equal(await store.countAdmins(), 1);
      assert.equal(await store.deleteAdmin(last.id), false, 'the last account stays');
      assert.ok(await store.getAdminById(last.id), 'the row is still there');
      assert.equal(await store.deleteAdmin('no-such-admin'), false);
      assert.equal((await remove('no-such-admin')).status, 404);
      assert.equal((await api('/api/admin/me', { token: owner })).status, 200);
    });

    test('removing another admin deletes the row and their links, and ends their session at once', async () => {
      assert.equal((await invite('leaving@test.co')).status, 200);
      const done = await reset(tokenSentTo('leaving@test.co'), 'leaving-password-1');
      assert.equal(done.status, 200);
      const theirs = done.body.token;
      assert.equal((await api('/api/admin/me', { token: theirs })).status, 200, 'signed in, and the session check has them cached');
      // A forgot link out for them too, so there is a live reset row to go with the account.
      sent.length = 0;
      assert.equal((await forgot('leaving@test.co')).status, 200);
      assert.equal(sent.length, 1);
      const resetToken = /\/admin\/reset\?token=([A-Za-z0-9_-]+)/.exec(sent[0].text)[1];
      assert.ok(await store.getPasswordReset(hashResetToken(resetToken)));
      sent.length = 0;

      const { id } = (await team()).body.find((m) => m.email === 'leaving@test.co');
      const res = await remove(id);
      assert.equal(res.status, 204);
      assert.equal(await store.getAdminById(id), null, 'the row is gone');
      assert.equal(await store.getPasswordReset(hashResetToken(resetToken)), null, 'and so are their links');
      assert.ok(!(await team()).body.some((m) => m.email === 'leaving@test.co'));
      assert.equal((await api('/api/admin/me', { token: theirs })).status, 401, 'their session is over at once');
      assert.equal((await api('/api/admin/communities', { token: theirs })).status, 401);
      assert.equal((await login('leaving@test.co', 'leaving-password-1')).status, 401, 'and they cannot sign in');
      assert.equal((await reset(resetToken, 'sneaking-back-in')).status, 400, 'nor use the link');
      const asked = await forgot('leaving@test.co');
      assert.equal(asked.status, 200, 'the forgot form answers as it does for any stranger');
      assert.equal(sent.length, 0, 'and sends nothing');
      assert.equal((await remove(id)).status, 404, 'a second removal finds nothing');
    });

    test('the ADMIN_EMAIL account is marked, and cannot be removed while a start would make it again', async () => {
      assert.equal((await invite('second@test.co')).status, 200);
      const second = (await reset(tokenSentTo('second@test.co'), 'second-password-1')).body.token;
      const me = (await api('/api/admin/me', { token: owner })).body;
      // As typed in the dashboard, whatever the case.
      process.env.ADMIN_EMAIL = OWNER.toUpperCase();
      process.env.ADMIN_PASSWORD = 'whatever-render-holds';
      try {
        const list = (await team()).body;
        assert.equal(list.find((m) => m.email === OWNER).bootstrap, true, 'the owner is the environment\'s account');
        assert.equal(list.find((m) => m.email === 'second@test.co').bootstrap, false);
        const res = await remove(me.id, second);
        assert.equal(res.status, 400);
        assert.match(res.body.error, /made again at the next deploy/);
        assert.match(res.body.error, /ADMIN_EMAIL and ADMIN_PASSWORD/, 'and says what to change');
        assert.ok(await store.getAdminById(me.id), 'the row is still there');
        assert.equal((await api('/api/admin/me', { token: owner })).status, 200);
      } finally {
        delete process.env.ADMIN_EMAIL;
        delete process.env.ADMIN_PASSWORD;
      }
      // With only the address set, a start makes nothing, so the account is an ordinary one again.
      process.env.ADMIN_EMAIL = OWNER;
      try {
        assert.equal((await team()).body.find((m) => m.email === OWNER).bootstrap, false);
      } finally {
        delete process.env.ADMIN_EMAIL;
      }
    });

    describe('with the limits on', () => {
      before(() => { process.env.RATE_LIMITS = 'on'; });
      after(() => { delete process.env.RATE_LIMITS; });

      test('twenty invites per visitor in an hour; a refused or duplicate address does not count', async () => {
        for (let n = 0; n < 19; n += 1) assert.equal((await invite(`limit${n}@limit.test`)).status, 200, `invite ${n + 1}`);
        assert.equal((await invite('limit0@limit.test')).status, 400, 'a duplicate is refused');
        assert.equal((await invite('not-an-address')).status, 400, 'and so is a non-address');
        assert.equal((await invite('limit19@limit.test')).status, 200, 'neither used up the twentieth');
        const stopped = await invite('limit20@limit.test');
        assert.equal(stopped.status, 429);
        assert.match(stopped.body.error, /Too many invites/);
        assert.ok(Number(stopped.headers.get('retry-after')) > 0, 'it says when to come back');
        assert.equal(await store.getAdminByEmail('limit20@limit.test'), null, 'nothing was made');
        assert.equal((await invite('bad-address')).status, 400, 'a non-address is still answered as one');
        // Another visitor (another admin at another address) is not stopped by this one's count.
        assert.equal((await invite('limit20@limit.test', { headers: { 'X-Forwarded-For': '203.0.113.9' } })).status, 200);
      });

      test('ten resends per visitor in an hour', async () => {
        const { id } = (await team()).body.find((m) => m.email === 'limit0@limit.test');
        for (let n = 0; n < 10; n += 1) assert.equal((await resend(id)).status, 200, `resend ${n + 1}`);
        const stopped = await resend(id);
        assert.equal(stopped.status, 429);
        assert.match(stopped.body.error, /Too many invites/);
        assert.ok(Number(stopped.headers.get('retry-after')) > 0);
        assert.equal((await resend(id, { headers: { 'X-Forwarded-For': '203.0.113.9' } })).status, 200, 'another visitor may');
      });
    });

    // Last, because it leaves the table without the owner the other tests sign in as.
    test('two admins removing each other at the same moment leave one account, never none', async () => {
      const pair = [];
      for (const email of ['one@race.test', 'two@race.test']) {
        const row = await store.createAdmin({ email, passwordHash: hashPassword('race-password-1') });
        const session = (await login(email, 'race-password-1')).body.token;
        assert.ok(session, `${email} is signed in`);
        pair.push({ ...row, session });
      }
      // Only the two of them, so the count is really at the edge; everyone else goes through the store.
      for (const other of (await store.listAdmins()).filter((a) => !a.email.endsWith('@race.test'))) {
        assert.equal(await store.deleteAdmin(other.id), true, other.email);
      }
      assert.equal(await store.countAdmins(), 2);
      const [one, two] = pair;
      const [oneRemovesTwo, twoRemovesOne] = await Promise.all([remove(two.id, one.session), remove(one.id, two.session)]);
      const statuses = [oneRemovesTwo.status, twoRemovesOne.status].sort();
      assert.equal(statuses[0], 204, `one removal went through (${statuses})`);
      // The other was refused as the last account, or, when the first had already finished, never got in.
      assert.ok([400, 401].includes(statuses[1]), `the other did not (${statuses})`);
      assert.equal(await store.countAdmins(), 1, 'somebody can still sign in');
    });
  });
}
