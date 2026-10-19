import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { backends, startBackend } from './fixtures/harness.js';

// The admin screen replaces the person it shows with whatever a save sends back. If that answer left out
// the consent record, a person who agreed to calls would read "Do not call: no consent on file" the moment
// the team marked them contacted. Both stores have to send the same thing as a plain read does.
for (const kind of backends()) {
  describe(`saving a change to a lead keeps their consent answer (${kind} store)`, () => {
    let app;
    let api;
    let token;

    before(async () => {
      app = await startBackend(kind, 'lead_update_consent');
      ({ api, token } = app);
    });
    after(async () => {
      await app.stop();
    });

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });

    test('the answer to a save, the first open and a plain read all carry it', async () => {
      const cid = (await admin('/communities', { method: 'POST', body: { name: 'Consent Keep' } })).body.id;
      const made = await api(`/api/c/${cid}/leads`, {
        method: 'POST', body: { name: 'Agreed Ana', email: 'ana@consent.test', phone: '(801) 555-0111', consent: true },
      });
      assert.equal(made.status, 201, JSON.stringify(made.body));
      const id = made.body.lead.id;

      // The first look marks the person opened, which is itself a save.
      const opened = await admin(`/leads/${id}`);
      assert.equal(opened.status, 200);
      assert.equal(opened.body.consent?.granted, true, 'first open');

      const marked = await admin(`/leads/${id}`, { method: 'PATCH', body: { status: 'contacted' } });
      assert.equal(marked.status, 200);
      assert.equal(marked.body.consent?.granted, true, 'after marking contacted');
      assert.equal(marked.body.status, 'contacted');

      const archived = await admin(`/leads/${id}`, { method: 'PATCH', body: { archived: true } });
      assert.equal(archived.body.consent?.granted, true, 'after archiving');

      const again = await admin(`/leads/${id}`);
      assert.deepEqual(again.body.consent, marked.body.consent, 'a plain read agrees with the save');
    });

    test('someone who never agreed still reads as not agreed after a save', async () => {
      const cid = (await admin('/communities', { method: 'POST', body: { name: 'Consent None' } })).body.id;
      const made = await api(`/api/c/${cid}/leads`, {
        method: 'POST', body: { name: 'Quiet Quin', email: 'quin@consent.test', phone: '(801) 555-0112' },
      });
      assert.equal(made.status, 201, JSON.stringify(made.body));
      const marked = await admin(`/leads/${made.body.lead.id}`, { method: 'PATCH', body: { status: 'contacted' } });
      assert.notEqual(marked.body.consent?.granted, true);
    });
  });
}
