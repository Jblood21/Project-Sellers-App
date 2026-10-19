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
      assert.deepEqual(res.body, {
        communities: [], calls: [], ready: [],
        totals: { communities: 0, people: 0, unread: 0, waiting: 0, overdue: 0, ready: 0, readyNew: 0 },
      });
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
      assert.deepEqual(res.body.totals, { communities: 2, people: 4, unread: 3, waiting: 2, overdue: 1, ready: 0, readyNew: 0 });

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
      assert.ok(res.body.calls.every((call) => !('key' in call)), 'the sort key stays on the server');
    });

    test('one order across every community: a call past its day in a later community comes before an earlier community\'s later calls', async () => {
      const first = await community('Today Eta');
      const second = await community('Today Theta');
      const upcoming = await signUp(first, { name: 'Upcoming Una', email: 'una@today.test' });
      const late = await signUp(second, { name: 'Late Lou', email: 'lou@today.test' });
      await app.store.updateLead(upcoming.lead.id, callFor(1));
      await app.store.updateLead(late.lead.id, callFor(-4));
      const { calls } = (await admin('/today')).body;
      const names = calls.map((call) => call.name);
      assert.ok(names.indexOf('Late Lou') !== -1 && names.indexOf('Late Lou') < names.indexOf('Upcoming Una'), names.join(', '));
      const firstOnTime = calls.findIndex((call) => !call.overdue);
      assert.ok(calls.slice(firstOnTime).every((call) => !call.overdue), 'every call past its day comes before every other');
    });

    test('the 30-call cap never cuts off a call past its day, whichever community it is in', async () => {
      // The store already holds well over 30 upcoming calls from the cap test above.
      const last = await community('Today Zeta');
      const late = await signUp(last, { name: 'Last Lee', email: 'lee2@today.test' });
      await app.store.updateLead(late.lead.id, callFor(-6));
      const { calls, totals } = (await admin('/today')).body;
      assert.equal(calls.length, 30);
      assert.ok(totals.waiting > 30);
      assert.equal(calls[0].leadId, late.lead.id, 'the call furthest past its day is first');
      assert.equal(calls[0].overdue, true);
    });

    test('the people who agreed to calls but booked none: who is in, who is not, in what order, and the counts', async () => {
      const first = await community('Ready Alpha');
      const second = await community('Ready Beta');
      const early = await signUp(first, { name: 'Early Eve', email: 'eve@ready.test', phone: '(801) 555-0201', consent: true });
      const handled = await signUp(first, { name: 'Handled Hank', email: 'hank@ready.test', phone: '(801) 555-0202', consent: true });
      const waiting = await signUp(first, { name: 'Waiting Wren', email: 'wren@ready.test', phone: '(801) 555-0203', consent: true });
      const declined = await signUp(first, { name: 'Declined Dot', email: 'dot@ready.test', phone: '(801) 555-0204', consent: false });
      const noPhone = await signUp(first, { name: 'Mailonly Max', email: 'max@ready.test' });
      const closed = await signUp(first, { name: 'Closed Cal', email: 'cal@ready.test', phone: '(801) 555-0205', consent: true });
      const contacted = await signUp(second, { name: 'Contacted Cora', email: 'cora@ready.test', phone: '(801) 555-0206', consent: true });
      const latest = await signUp(second, { name: 'Latest Lu', email: 'lu@ready.test', phone: '(801) 555-0207', consent: true });
      const never = await app.store.createLead(second, { name: 'Never Ned', email: 'ned@ready.test', phone: '(801) 555-0208' });
      await app.store.updateLead(handled.lead.id, callFor(1, { handledAt: new Date().toISOString() }));
      await app.store.updateLead(waiting.lead.id, callFor(1));
      await admin(`/leads/${closed.lead.id}`, { method: 'PATCH', body: { archived: true } });
      await admin(`/leads/${contacted.lead.id}`, { method: 'PATCH', body: { status: 'contacted' } });

      const { ready, totals, communities } = (await admin('/today')).body;
      const mine = ready.filter((person) => [first, second].includes(person.communityId));
      assert.deepEqual(
        mine.map((person) => person.name),
        ['Latest Lu', 'Early Eve', 'Contacted Cora'],
        'not contacted first, the most recent to agree first',
      );
      for (const name of ['Handled Hank', 'Waiting Wren', 'Declined Dot', 'Mailonly Max', 'Closed Cal', 'Never Ned']) {
        assert.ok(!ready.some((person) => person.name === name), `${name} is not on it`);
      }
      assert.ok(never.id, 'a lead with no consent record was made');
      const lu = mine[0];
      assert.equal(lu.communityName, 'Ready Beta');
      assert.equal(lu.communityId, second);
      assert.equal(lu.leadId, latest.lead.id);
      assert.equal(lu.phone, '(801) 555-0207');
      assert.equal(lu.contacted, false);
      assert.ok(lu.agreedAt, 'when they agreed');
      assert.equal(mine.at(-1).contacted, true);
      assert.ok(!('email' in lu) && !('firstVisitAt' in lu), 'only what the list shows');
      const byName = Object.fromEntries(communities.map((c) => [c.name, c]));
      assert.deepEqual([byName['Ready Alpha'].ready, byName['Ready Alpha'].readyNew], [1, 1], 'a person who booked a call, even one handled since, is not one who booked none');
      assert.deepEqual([byName['Ready Beta'].ready, byName['Ready Beta'].readyNew], [2, 1]);
      assert.equal(totals.ready, communities.reduce((sum, c) => sum + c.ready, 0));
      assert.equal(totals.readyNew, communities.reduce((sum, c) => sum + c.readyNew, 0));
      assert.ok(early.lead.id && declined.lead.id && noPhone.lead.id);
    });

    test('a call about financing names the community\'s own lender', async () => {
      const cid = await community('Today Iota');
      await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { lenderName: 'Acme Loans' } } });
      const person = await signUp(cid, { name: 'Lender Lia', email: 'lia@today.test', phone: '(801) 555-0105', consent: true });
      await app.store.updateLead(person.lead.id, callFor(2));
      const call = (await admin('/today')).body.calls.find((c) => c.leadId === person.lead.id);
      assert.match(call.when, /Acme Loans/);
    });
  });

  describe(`which calls the Leads list calls late (${kind} store)`, () => {
    let app;
    let api;
    let token;

    before(async () => {
      app = await startBackend(kind, 'lead_call_late');
      ({ api, token } = app);
    });
    after(async () => {
      await app.stop();
    });

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });

    test('only a call still waiting whose day has passed is late', async () => {
      const cid = (await admin('/communities', { method: 'POST', body: { name: 'Late Check' } })).body.id;
      const make = async (name, tour, patch = {}) => {
        const made = await api(`/api/c/${cid}/leads`, { method: 'POST', body: { name, email: `${name.replace(/\W/g, '').toLowerCase()}@late.test`, phone: '' } });
        assert.equal(made.status, 201, JSON.stringify(made.body));
        await app.store.updateLead(made.body.lead.id, { tour, ...patch });
        return made.body.lead.id;
      };
      const call = (daysAhead, extra = {}) => ({ slotId: null, date: dayIso(daysAhead), time: '10:00', contact: 'phone', topic: 'lender', requestedAt: new Date().toISOString(), ...extra });
      const ids = {
        past: await make('Past Pia', call(-4)),
        future: await make('Future Fay', call(4)),
        handled: await make('Handled Hal', call(-4, { handledAt: new Date().toISOString() })),
        closed: await make('Closed Cy', call(-4), { archivedAt: new Date().toISOString() }),
        none: await make('Plain Pam', null),
        undated: await make('Undated Una', { slotId: null, date: '', time: '', contact: 'email', topic: 'community', requestedAt: new Date().toISOString() }),
      };
      const list = (await admin(`/communities/${cid}/leads`)).body;
      const late = Object.fromEntries(list.map((lead) => [lead.id, lead.callLate]));
      assert.equal(late[ids.past], true);
      assert.equal(late[ids.future], false);
      assert.equal(late[ids.handled], false, 'handled is not waiting');
      assert.equal(late[ids.closed], false, 'closed is not waiting');
      assert.equal(late[ids.none], false);
      assert.equal(late[ids.undated], false, 'no day, so no day has passed');
    });
  });
}
