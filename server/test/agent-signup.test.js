import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { GIF, backends, startBackend } from './fixtures/harness.js';

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

    test('what an agent says about themselves at sign-up is their profile, and every listing starts from it', async () => {
      const res = await signup({
        email: 'Profile.Agent@Example.test', password: 'agent-pass-1234', code: 'open-sesame',
        name: 'Maren Whitcombe', phone: '801-555-0111', brokerage: 'Alder & Finch Realty', license: 'Lic. #LP-9',
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const token = res.body.token;
      const mine = (await api('/api/admin/me/profile', { token })).body;
      assert.deepEqual(
        [mine.name, mine.phone, mine.brokerage, mine.license, mine.email, mine.photo],
        ['Maren Whitcombe', '801-555-0111', 'Alder & Finch Realty', 'Lic. #LP-9', 'profile.agent@example.test', null],
        'the email is the sign-in address until they type another',
      );
      // A listing made with none of it typed starts filled in from the account.
      const made = await api('/api/admin/communities', { token, method: 'POST', body: { kind: 'listing', address: '7 Autofill Way', price: '500k' } });
      assert.equal(made.status, 201, JSON.stringify(made.body));
      assert.equal(made.body.builder, 'Alder & Finch Realty');
      assert.equal(made.body.settings.agentLicense, 'Lic. #LP-9');
      const agent = made.body.agents[0];
      assert.deepEqual([agent.name, agent.phone, agent.email, agent.brokerage, agent.licenseNo], ['Maren Whitcombe', '801-555-0111', 'profile.agent@example.test', 'Alder & Finch Realty', 'LP-9']);
    });

    test('the profile can be changed, takes a portrait that goes onto each new listing, and refuses bad input', async () => {
      const token = (await signup({ email: 'face@example.test', password: 'agent-pass-1234', code: 'open-sesame', name: 'Face Agent' })).body.token;
      const put = (body) => api('/api/admin/me/profile', { token, method: 'PUT', body });
      assert.equal((await put({ phone: '801-555-0199', email: 'face.agent@brokerage.test' })).status, 200);
      assert.equal((await put({ email: 'nope' })).status, 400);
      assert.equal((await put({ name: 'x'.repeat(81) })).status, 400);
      assert.equal((await put({ photo: 'not an image' })).status, 400);
      const withPhoto = (await put({ photo: GIF })).body;
      assert.ok(withPhoto.photo?.startsWith('data:image/gif;base64,'));
      assert.deepEqual([withPhoto.name, withPhoto.phone, withPhoto.email], ['Face Agent', '801-555-0199', 'face.agent@brokerage.test'], 'other details untouched by a photo change');
      const made = await api('/api/admin/communities', { token, method: 'POST', body: { kind: 'listing', address: '8 Face Way', price: '450k' } });
      const full = (await api(`/api/admin/communities/${made.body.id}`, { token })).body;
      assert.ok(full.agents[0].photo, 'their face is on the listing\'s agent');
      assert.equal((await put({ photo: null })).body.photo, null, 'removed');
    });

    test('what is typed when making a listing is kept for the next one, and a blank never clears it', async () => {
      const token = (await signup({ email: 'keep@example.test', password: 'agent-pass-1234', code: 'open-sesame' })).body.token;
      await api('/api/admin/communities', {
        token, method: 'POST',
        body: { kind: 'listing', address: '1 Keep Lane', price: '450k', agentName: 'Kay Keeper', agentPhone: '801-555-0123', brokerage: 'Keep Realty' },
      });
      const after = (await api('/api/admin/me/profile', { token })).body;
      assert.deepEqual([after.name, after.phone, after.brokerage], ['Kay Keeper', '801-555-0123', 'Keep Realty']);
      await api('/api/admin/communities', { token, method: 'POST', body: { kind: 'listing', address: '2 Keep Lane', price: '450k', agentName: '', agentPhone: '' } });
      const still = (await api('/api/admin/me/profile', { token })).body;
      assert.equal(still.name, 'Kay Keeper', 'a blank box did not erase it');
    });

    test('refuses a bad address and a weak password', async () => {
      assert.equal((await signup({ ...good, email: 'not-an-email' })).status, 400);
      assert.equal((await signup({ ...good, email: 'new@example.test', password: 'short' })).status, 400);
    });
  });
}
