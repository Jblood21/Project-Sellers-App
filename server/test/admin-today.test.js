import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { backends, startBackend } from './fixtures/harness.js';

const pad = (n) => String(n).padStart(2, '0');
const dayIso = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

for (const kind of backends()) {
  describe(`the Today summary the admin opens on (${kind} store)`, () => {
    let app;
    let api;
    let token;

    before(async () => {
      app = await startBackend(kind, 'admin_today');
      ({ api, token } = app);
    });
    after(async () => {
      await app.stop();
    });

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const community = async (name) => (await admin('/communities', { method: 'POST', body: { name } })).body.id;
    const signUp = async (cid, who) => {
      const res = await api(`/api/c/${cid}/leads`, { method: 'POST', body: { phone: '', ...who } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body;
    };
    const callFor = (daysAhead, extra = {}) => ({
      tour: { slotId: null, date: dayIso(daysAhead), time: '10:00', contact: 'phone', topic: 'lender', requestedAt: new Date().toISOString(), ...extra },
    });

    test('needs an admin', async () => {
      assert.equal((await api('/api/admin/today')).status, 401);
      assert.equal((await api('/api/admin/today', { token: 'nonsense' })).status, 401);
    });

    test('with nothing yet it is empty, not an error', async () => {
      const res = await admin('/today');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { communities: [], calls: [], totals: { communities: 0, people: 0, unread: 0, waiting: 0, overdue: 0 } });
    });

    test('counts open people, those nobody has opened and the calls waiting for each community, and lists the calls', async () => {
      const a = await community('Today Alpha');
      const b = await community('Today Beta');
      const soon = await signUp(a, { name: 'Soon Sam', email: 'soon@today.test', phone: '(801) 555-0101', consent: true });
      const past = await signUp(a, { name: 'Past Pat', email: 'past@today.test', phone: '(801) 555-0102' });
      const handled = await signUp(a, { name: 'Handled Hal', email: 'hal@today.test' });
      const gone = await signUp(a, { name: 'Gone Gus', email: 'gus@today.test', phone: '(801) 555-0103', consent: true });
      await signUp(b, { name: 'Lone Lee', email: 'lee@today.test' });
      await app.store.updateLead(soon.lead.id, callFor(2));
      await app.store.updateLead(past.lead.id, callFor(-3, { topic: 'community' }));
      await app.store.updateLead(handled.lead.id, callFor(1, { handledAt: new Date().toISOString() }));
      await app.store.updateLead(gone.lead.id, callFor(1));
      await admin(`/leads/${gone.lead.id}`, { method: 'PATCH', body: { archived: true } });
      // Reading a lead is what marks it opened.
      assert.equal((await admin(`/leads/${handled.lead.id}`)).status, 200);

      const res = await admin('/today');
      assert.equal(res.status, 200);
      const byName = Object.fromEntries(res.body.communities.map((c) => [c.name, c]));
      assert.equal(byName['Today Alpha'].people, 3, 'the closed person is not one of them');
      assert.equal(byName['Today Alpha'].unread, 2, 'the one whose page was opened is not unread');
      assert.equal(byName['Today Alpha'].waiting, 2);
      assert.equal(byName['Today Alpha'].overdue, 1);
      assert.equal(byName['Today Beta'].people, 1);
      assert.equal(byName['Today Beta'].waiting, 0);
      assert.equal(typeof byName['Today Alpha'].homesCount, 'number');
      assert.deepEqual(res.body.totals, { communities: 2, people: 4, unread: 3, waiting: 2, overdue: 1 });

      assert.deepEqual(res.body.calls.map((c) => c.name), ['Past Pat', 'Soon Sam'], 'past their day first, then the soonest');
      assert.equal(res.body.calls[0].overdue, true);
      assert.equal(res.body.calls[1].overdue, false);
      assert.equal(res.body.calls[1].canCall, true, 'agreed to calls and gave a number');
      assert.equal(res.body.calls[0].canCall, false, 'a number but never agreed: not offered a one-tap call');
      assert.equal(res.body.calls[1].communityName, 'Today Alpha');
      assert.equal(res.body.calls[1].leadId, soon.lead.id);
      assert.match(res.body.calls[1].when, /about financing/);
      assert.ok(!JSON.stringify(res.body.calls).includes('Gone Gus'), 'a closed person is in no list');
    });

    test('a person who books again after being closed is back in the count', async () => {
      const cid = await community('Today Gamma');
      const person = await signUp(cid, { name: 'Back Bea', email: 'bea@today.test', phone: '(801) 555-0104', consent: true });
      await admin(`/leads/${person.lead.id}`, { method: 'PATCH', body: { archived: true } });
      const before = (await admin('/today')).body.communities.find((c) => c.name === 'Today Gamma');
      assert.equal(before.people, 0);
      await app.store.updateLead(person.lead.id, { archivedAt: null, ...callFor(1) });
      const afterwards = (await admin('/today')).body.communities.find((c) => c.name === 'Today Gamma');
      assert.equal(afterwards.people, 1);
      assert.equal(afterwards.waiting, 1);
    });

    test('the list of calls is capped at 30 while the totals are not', async () => {
      const cid = await community('Today Delta');
      for (let i = 0; i < 33; i += 1) {
        const lead = await signUp(cid, { name: `Caller ${i}`, email: `c${i}@today.test` });
        await app.store.updateLead(lead.lead.id, callFor(5 + (i % 3)));
      }
      const res = await admin('/today');
      assert.equal(res.body.calls.length, 30);
      assert.ok(res.body.totals.waiting >= 33);
    });
  });
}
