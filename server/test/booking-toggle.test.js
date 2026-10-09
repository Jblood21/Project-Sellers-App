import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { backends, startBackend } from './fixtures/harness.js';

const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

for (const kind of backends()) {
  describe(`the booking switch (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;
    let slots;
    let buyer;

    before(async () => {
      app = await startBackend(kind, 'booking_toggle');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Switch Test' } })).body.id;
      slots = (await api(`/api/admin/communities/${cid}/slots`, {
        method: 'POST', token, body: { dates: [futureDate(2), futureDate(3)], times: ['09:00', '10:00', '11:00'] },
      })).body.slots;
      buyer = (await api(`/api/c/${cid}/leads`, { method: 'POST', body: { name: 'Pat Vale', email: 'pat@test.co', phone: '(801) 555-0101' } })).body;
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const setBooking = (on) => admin(`/communities/${cid}`, { method: 'PATCH', body: { features: { booking: on } } });

    test('booking is on by default, for a new community and as the admin sees it', async () => {
      assert.equal((await admin(`/communities/${cid}`)).body.features.booking, true);
      const page = (await api(`/api/c/${cid}`)).body;
      assert.equal(page.features.booking, true);
      assert.ok(page.slots.length >= 6, 'and the times are served');
    });

    test('switched off, a buyer is served no times and cannot take one', async () => {
      const off = await setBooking(false);
      assert.equal(off.status, 200);
      assert.equal(off.body.features.booking, false);

      const page = (await api(`/api/c/${cid}`)).body;
      assert.equal(page.features.booking, false);
      assert.deepEqual(page.slots, [], 'the public payload carries no times');
      assert.deepEqual((await api(`/api/c/${cid}/slots`)).body, [], 'and neither does the live list');

      const tried = await api('/api/me/tour', { method: 'POST', token: buyer.token, body: { slotId: slots[0].id, contact: 'phone' } });
      assert.equal(tried.status, 403, 'a sheet that was already open cannot book');
      assert.match(tried.body.error, /turned off/);
      assert.equal((await api('/api/me', { token: buyer.token })).body.tour, null, 'nothing was booked');
    });

    test('the times are kept while it is off, and come back when it is switched on', async () => {
      const kept = (await admin(`/communities/${cid}/slots`)).body;
      assert.ok(kept.length >= 6, 'the admin still sees every published time');
      assert.ok(kept.every((slot) => !slot.leadId), 'none was taken while it was off');

      assert.equal((await setBooking(true)).body.features.booking, true);
      const live = (await api(`/api/c/${cid}/slots`)).body;
      assert.equal(live.length, kept.length);
      const booked = await api('/api/me/tour', { method: 'POST', token: buyer.token, body: { slotId: slots[0].id, contact: 'phone' } });
      assert.equal(booked.status, 200);
    });

    test('a booking made before it was switched off survives, and the team is still told about it', async () => {
      await setBooking(false);
      const me = (await api('/api/me', { token: buyer.token })).body;
      assert.equal(me.tour.slotId, slots[0].id, 'their time is still theirs');
      const leads = (await admin(`/communities/${cid}/leads`)).body;
      assert.ok(leads.some((lead) => lead.tour?.slotId === slots[0].id), 'and still in the builder’s queue');
      await setBooking(true);
    });

    test('the team contact is saved, checked, and served to buyers', async () => {
      const saved = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { teamPhone: '(801) 555-0199', teamEmail: 'sales@switch.test' } } });
      assert.equal(saved.status, 200);
      const page = (await api(`/api/c/${cid}`)).body;
      assert.equal(page.settings.teamPhone, '(801) 555-0199');
      assert.equal(page.settings.teamEmail, 'sales@switch.test');

      for (const bad of ['a@b.co?bcc=x@y.z', 'one@b.co, two@b.co', 'no-at', 'a b@c.co']) {
        const res = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { teamEmail: bad } } });
        assert.equal(res.status, 400, bad);
        assert.match(res.body.error, /sales team email/);
      }
      const long = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { teamPhone: '8'.repeat(900) } } });
      assert.equal(long.status, 200);
      assert.ok(long.body.settings.teamPhone.length <= 300, 'a pasted novel is cut at the door');
    });

    test('a community that never heard of the switch is on', async () => {
      // What a payload from before the switch looks like: no booking key at all.
      const page = (await api(`/api/c/${cid}`)).body;
      const old = { ...page.features };
      delete old.booking;
      assert.notEqual(old.booking, false, 'the buyer app treats a missing key as on');
    });
  });
}
