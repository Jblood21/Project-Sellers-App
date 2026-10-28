import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { GIF, backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

/*
 * An agent keeps lenders on their account: typed once, used on any listing (copied onto it), one marked as the usual
 * one that every new listing starts with. Each agent sees only their own.
 */
for (const kind of backends()) {
  describe(`saved contacts (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let other;
    const lender = {
      lenderName: 'Alpine Home Loans', lenderNmls: '123456', loName: 'Dana Ortiz', loNmls: '987654', lenderPhone: '801-555-0199',
      lenderEmail: 'dana@alpine.test', lenderWebsite: 'https://alpine.test', lenderAddress: '100 Main St', loanApplicationUrl: 'https://alpine.test/apply',
    };
    const listing = (t, address) => api('/api/admin/communities', { token: t, method: 'POST', body: { kind: 'listing', address, city: 'Lehi, UT', price: '500k' } });

    before(async () => {
      process.env.AGENT_SIGNUP_CODE = 'open-sesame';
      app = await startBackend(kind, 'contacts');
      ({ api } = app);
      const mk = async (email) => (await api('/api/admin/signup', { method: 'POST', body: { email, password: 'agent-pass-1234', code: 'open-sesame' } })).body.token;
      token = await mk('c1@agent.test');
      other = await mk('c2@agent.test');
    });
    after(async () => {
      delete process.env.AGENT_SIGNUP_CODE;
      await app.stop();
    });

    test('a contact needs a name and real values', async () => {
      const post = (body) => api('/api/admin/me/contacts', { token, method: 'POST', body });
      assert.equal((await post({ fields: {} })).status, 400);
      assert.equal((await post({ fields: { ...lender, lenderEmail: 'not an email' } })).status, 400);
      assert.equal((await post({ fields: { ...lender, loanApplicationUrl: 'javascript:alert(1)' } })).status, 400);
      assert.deepEqual((await api('/api/admin/me/contacts', { token })).body, []);
    });

    test('is saved once, listed, edited and removed; only its owner sees it', async () => {
      const made = await api('/api/admin/me/contacts', { token, method: 'POST', body: { fields: lender, logo: GIF } });
      assert.equal(made.status, 201, JSON.stringify(made.body));
      assert.equal(made.body.contact.label, 'Dana Ortiz · Alpine Home Loans');
      assert.equal(made.body.contact.hasLogo, true);
      const id = made.body.contact.id;
      assert.equal((await api('/api/admin/me/contacts', { token: other })).body.length, 0, 'not shared with another agent');
      const edit = await api(`/api/admin/me/contacts/${id}`, { token, method: 'PUT', body: { label: 'My lender', fields: { ...lender, lenderPhone: '801-555-0100' } } });
      assert.equal(edit.status, 200);
      assert.equal(edit.body[0].label, 'My lender');
      assert.equal(edit.body[0].fields.lenderPhone, '801-555-0100');
      assert.equal(edit.body[0].hasLogo, true, 'the logo stays when a save does not send one');
      assert.equal((await api(`/api/admin/me/contacts/${id}`, { token: other, method: 'DELETE' })).body.length, 0);
      assert.equal((await api('/api/admin/me/contacts', { token })).body.length, 1, 'another agent cannot remove it');
      assert.equal((await api(`/api/admin/me/contacts/${id}`, { token, method: 'DELETE' })).body.length, 0);
    });

    test('using one copies it, with its logo, onto a listing; another listing is untouched', async () => {
      const id = (await api('/api/admin/me/contacts', { token, method: 'POST', body: { fields: lender, logo: GIF } })).body.contact.id;
      const a = (await listing(token, '1 Use Way')).body;
      const b = (await listing(token, '2 Other Way')).body;
      assert.equal(a.settings.lenderName, '', 'a listing starts with no lender');
      const used = await api(`/api/admin/communities/${a.id}/lender/use`, { token, method: 'POST', body: { contactId: id } });
      assert.equal(used.status, 200, JSON.stringify(used.body));
      const after = (await api(`/api/admin/communities/${a.id}`, { token })).body;
      assert.equal(after.settings.lenderName, 'Alpine Home Loans');
      assert.equal(after.settings.loNmls, '987654');
      assert.ok(after.lenderLogo, 'the logo came along');
      assert.equal((await api(`/api/admin/communities/${b.id}`, { token })).body.settings.lenderName, '');
      // A contact that is not theirs cannot be used.
      const theirs = (await listing(other, '3 Theirs Way')).body;
      assert.equal((await api(`/api/admin/communities/${theirs.id}/lender/use`, { token: other, method: 'POST', body: { contactId: id } })).status, 404);
      // A listing that is not theirs cannot be changed.
      assert.equal((await api(`/api/admin/communities/${a.id}/lender/use`, { token: other, method: 'POST', body: { contactId: id } })).status, 403);
    });

    test('what a listing has as its lender can be saved as a contact, logo included', async () => {
      const c = (await listing(token, '4 Save Way')).body;
      await api(`/api/admin/communities/${c.id}`, { token, method: 'PATCH', body: { settings: lender } });
      await api(`/api/admin/communities/${c.id}/photos/lenderlogo`, { token, method: 'POST', body: { dataUrl: GIF } });
      const before = (await api('/api/admin/me/contacts', { token })).body.length;
      const saved = await api(`/api/admin/communities/${c.id}/lender/save`, { token, method: 'POST', body: { fields: lender } });
      assert.equal(saved.status, 201, JSON.stringify(saved.body));
      assert.equal(saved.body.contacts.length, before + 1);
      assert.equal(saved.body.contact.hasLogo, true);
    });

    test('the usual lender starts on every new listing; unmarking stops it', async () => {
      const list = (await api('/api/admin/me/contacts', { token })).body;
      const id = list[0].id;
      await api(`/api/admin/me/contacts/${id}`, { token, method: 'PUT', body: { label: list[0].label, fields: list[0].fields, isDefault: true } });
      const made = (await listing(token, '5 Usual Way')).body;
      const got = (await api(`/api/admin/communities/${made.id}`, { token })).body;
      assert.equal(got.settings.lenderName, 'Alpine Home Loans');
      assert.ok(got.lenderLogo);
      await api(`/api/admin/me/contacts/${id}`, { token, method: 'PUT', body: { label: list[0].label, fields: list[0].fields, isDefault: false } });
      const next = (await listing(token, '6 Usual Way')).body;
      assert.equal((await api(`/api/admin/communities/${next.id}`, { token })).body.settings.lenderName, '');
    });
  });
}
