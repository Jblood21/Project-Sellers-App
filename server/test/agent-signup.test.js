import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { backends, startBackend } from './fixtures/harness.js';

// The limits are off under `node --test`; nothing here turns them on.
delete process.env.RATE_LIMITS;

/*
 * An agent makes their own account with an access code the owner gave them. The account is a member with nothing
 * shared, so what they see is what they make. Closed while no code is set; an existing address is refused, never
 * reset.
 */
for (const kind of backends()) {
  describe(`agent sign-up (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    const signup = (body) => api('/api/admin/signup', { method: 'POST', body });
    const good = { email: 'Agent.One@Example.test', password: 'agent-pass-1234', code: 'open-sesame' };

    before(async () => {
      delete process.env.AGENT_SIGNUP_CODE;
      app = await startBackend(kind, 'agent-signup');
      ({ api, token: owner } = app);
    });
    after(async () => {
      delete process.env.AGENT_SIGNUP_CODE;
      await app.stop();
    });

    test('is closed while no code is set, and says so', async () => {
      assert.deepEqual((await api('/api/admin/signup')).body, { open: false });
      const res = await signup(good);
      assert.equal(res.status, 403);
      assert.match(res.body.error, /not open/);
    });

    test('opens with a code: a wrong or missing code makes nothing', async () => {
      process.env.AGENT_SIGNUP_CODE = 'open-sesame';
      assert.deepEqual((await api('/api/admin/signup')).body, { open: true });
      for (const code of ['wrong', '', undefined, 'open-sesame-x']) {
        const res = await signup({ ...good, code });
        assert.equal(res.status, 403, String(code));
        assert.match(res.body.error, /access code/);
      }
      assert.equal((await api('/api/admin/login', { method: 'POST', body: { email: good.email, password: good.password } })).status, 401);
    });

    test('makes a member with nothing shared, who is signed in and can make listings but not communities', async () => {
      const res = await signup({ ...good, code: ' open-sesame ' });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.admin.email, 'agent.one@example.test', 'the address is kept in lower case');
      assert.equal(res.body.admin.role, 'member');
      const token = res.body.token;
      assert.deepEqual((await api('/api/admin/communities', { token })).body, [], 'nothing is shared with them');
      assert.equal((await api('/api/admin/me', { token })).body.role, 'member');
      const own = await api('/api/admin/communities', {
        token, method: 'POST', body: { kind: 'listing', address: '1 Agent Way', city: 'Lehi, UT', price: '450k' },
      });
      assert.equal(own.status, 201, JSON.stringify(own.body));
      assert.equal((await api('/api/admin/communities', { token })).body.length, 1);
      const community = await api('/api/admin/communities', { token, method: 'POST', body: { name: 'Nope' } });
      assert.equal(community.status, 403);
      // And they can sign in again with what they chose.
      const again = await api('/api/admin/login', { method: 'POST', body: { email: 'agent.one@example.test', password: good.password } });
      assert.equal(again.status, 200);
    });

    test('an address that has an account is refused and its password is never replaced', async () => {
      const res = await signup({ ...good, password: 'a-different-pass-99' });
      assert.equal(res.status, 409);
      assert.match(res.body.error, /already has an account/);
      assert.equal((await api('/api/admin/login', { method: 'POST', body: { email: good.email, password: good.password } })).status, 200);
      assert.equal((await api('/api/admin/login', { method: 'POST', body: { email: good.email, password: 'a-different-pass-99' } })).status, 401);
    });

    test('the owner\'s own address cannot be taken either', async () => {
      assert.ok(owner, 'the bootstrap owner exists');
      const me = (await api('/api/admin/me', { token: owner })).body;
      const res = await signup({ email: me.email, password: 'takeover-pass-123', code: 'open-sesame' });
      assert.equal(res.status, 409);
    });

    test('refuses a bad address and a weak password', async () => {
      assert.equal((await signup({ ...good, email: 'not-an-email' })).status, 400);
      assert.equal((await signup({ ...good, email: 'new@example.test', password: 'short' })).status, 400);
    });
  });
}
