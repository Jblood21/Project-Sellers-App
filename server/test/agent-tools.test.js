import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { setTransportForTests } from '../lib/email.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

/*
 * What an agent adds to each person: how interested they are, a note, a day to follow up; a showing the person asks for on
 * a listing and the agent's answer (confirm, suggest another time, decline), which is emailed; and copying a listing.
 */
for (const kind of backends()) {
  describe(`agent tools (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let restore;
    let listing;
    let buyer;
    let lead;
    const sent = [];
    const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

    before(async () => {
      process.env.RESEND_API_KEY = 're_test';
      app = await startBackend(kind, 'agent-tools');
      ({ api, token: owner } = app);
      restore = setTransportForTests(async (payload) => { sent.push(payload); return {}; });
      listing = (await api('/api/admin/communities', {
        token: owner, method: 'POST',
        body: { kind: 'listing', address: '12 Oak Lane', price: '450000', beds: 3, baths: 2, sqft: 1800, agentName: 'Ann Agent', agentPhone: '801-555-0100' },
      })).body;
      const entered = await api(`/api/c/${listing.id}/leads`, { method: 'POST', body: { name: 'Pat Buyer', email: 'pat@buyer.test', phone: '801-555-0199' } });
      buyer = entered.body.token;
      lead = entered.body.lead ?? entered.body;
    });
    after(async () => {
      restore?.();
      delete process.env.RESEND_API_KEY;
      await app.stop();
    });

    const leadId = async () => (await api(`/api/admin/communities/${listing.id}/leads`, { token: owner })).body[0].id;
    const patch = async (body) => api(`/api/admin/leads/${await leadId()}`, { token: owner, method: 'PATCH', body });

    test('interest and a follow-up day are kept, cleared, and checked', async () => {
      const set = await patch({ interest: 'hot', followUpOn: day(1), notes: 'Wants a big yard, pre-approved' });
      assert.equal(set.status, 200);
      assert.equal(set.body.interest, 'hot');
      assert.equal(set.body.followUpOn, day(1));
      assert.equal((await patch({ interest: 'bogus' })).status, 400);
      assert.equal((await patch({ followUpOn: '2026-02-31' })).status, 400);
      assert.equal((await patch({ followUpOn: 'tomorrow' })).status, 400);
      const cleared = await patch({ interest: '', followUpOn: '' });
      assert.equal(cleared.body.interest, '');
      assert.equal(cleared.body.followUpOn, '');
      assert.equal(cleared.body.notes, 'Wants a big yard, pre-approved', 'a note is not lost when the others change');
    });

    test('a buyer is never shown the team\'s interest, follow-up day or notes', async () => {
      await patch({ interest: 'warm', followUpOn: day(2), notes: 'private' });
      const me = await api('/api/me', { token: buyer });
      const text = JSON.stringify(me.body);
      assert.ok(!text.includes('private'));
      assert.ok(!('interest' in (me.body.lead ?? me.body)));
      assert.ok(!('followUpOn' in (me.body.lead ?? me.body)));
      await patch({ interest: '', followUpOn: '' });
    });

    test('Today lists follow-ups due on the viewer\'s day, oldest first, and not closed or not-interested people', async () => {
      await patch({ followUpOn: day(-3), interest: 'hot' });
      const due = await api(`/api/admin/today?day=${day(0)}`, { token: owner });
      assert.equal(due.body.followUps.length, 1);
      assert.equal(due.body.followUps[0].overdue, true);
      const early = await api(`/api/admin/today?day=${day(-5)}`, { token: owner });
      assert.equal(early.body.followUps.length, 0, 'not due yet on an earlier day');
      await patch({ interest: 'not_interested' });
      assert.equal((await api(`/api/admin/today?day=${day(0)}`, { token: owner })).body.followUps.length, 0);
      await patch({ interest: 'hot' });
      await patch({ archived: true });
      assert.equal((await api(`/api/admin/today?day=${day(0)}`, { token: owner })).body.followUps.length, 0, 'closed people never list');
      await patch({ archived: false, interest: '', followUpOn: '' });
    });

    test('a showing is asked for, answered and emailed; a bad day or answer is refused', async () => {
      const bad = await api('/api/me/showing', { method: 'POST', token: buyer, body: { date: 'soon' } });
      assert.equal(bad.status, 400);
      assert.equal((await api('/api/me/showing', { method: 'POST', token: buyer, body: { date: day(-2) } })).status, 400);
      const asked = await api('/api/me/showing', { method: 'POST', token: buyer, body: { date: day(3), part: 'Morning', message: 'Can we bring the dog?' } });
      assert.equal(asked.status, 200);
      assert.equal(asked.body.showing.response, null);

      const today = await api(`/api/admin/today?day=${day(0)}`, { token: owner });
      assert.equal(today.body.showings.length, 1);
      assert.equal(today.body.showings[0].part, 'Morning');
      assert.equal(today.body.showings[0].canCall, false, 'they did not agree to calls, so no Call button');

      assert.equal((await patch({ showingResponse: { status: 'maybe' } })).status, 400);
      assert.equal((await patch({ showingResponse: { status: 'confirmed', date: day(3) } })).status, 400, 'a time is needed');
      sent.length = 0;
      const ok = await patch({ showingResponse: { status: 'confirmed', date: day(3), time: '10:00', message: 'See you there' } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.showing.response.status, 'confirmed');
      assert.equal(ok.body.status, 'contacted', 'answering counts as contacting them');
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to[0], 'pat@buyer.test');
      assert.match(sent[0].subject, /confirmed/);
      assert.match(sent[0].attachments[0].filename, /\.ics$/);
      const ics = Buffer.from(sent[0].attachments[0].content, 'base64').toString();
      assert.match(ics, /BEGIN:VEVENT/);
      assert.match(ics, /DTSTART:\d{8}T100000/);

      const mine = await api('/api/me', { token: buyer });
      const shown = (mine.body.lead ?? mine.body).showing;
      assert.equal(shown.response.status, 'confirmed');
      assert.equal((await api(`/api/admin/today?day=${day(0)}`, { token: owner })).body.showings.length, 0, 'answered requests stop waiting');
    });

    test('declining and suggesting another time email the buyer without an invite', async () => {
      await api('/api/me/showing', { method: 'POST', token: buyer, body: { date: day(4) } });
      sent.length = 0;
      const suggest = await patch({ showingResponse: { status: 'suggested', date: day(5), time: '14:30' } });
      assert.equal(suggest.status, 200);
      assert.match(sent[0].subject, /Another time/);
      assert.equal(sent[0].attachments, undefined);
      const no = await patch({ showingResponse: { status: 'declined', message: 'Under contract soon' } });
      assert.equal(no.body.showing.response.date, '');
      assert.match(sent[1].subject, /About your showing/);
    });

    test('a listing is copied with its look and setup but not its open houses or MLS number', async () => {
      const saved = await api(`/api/admin/communities/${listing.id}`, { token: owner, method: 'PATCH', body: { settings: { mlsNumber: 'MLS-1', lenderName: 'Fine Lender' } } });
      assert.equal(saved.body.settings.mlsNumber, 'MLS-1', 'the original has an MLS number to leave behind');
      const copy = await api('/api/admin/communities', {
        token: owner, method: 'POST',
        body: { kind: 'listing', address: '14 Oak Lane', price: '460000', beds: 3, baths: 2, sqft: 1900, copyFrom: listing.id },
      });
      assert.equal(copy.status, 201);
      assert.notEqual(copy.body.id, listing.id);
      assert.equal(copy.body.name, '14 Oak Lane');
      assert.equal(copy.body.layout, listing.layout);
      assert.equal(copy.body.homes.length, 1);
      assert.equal(copy.body.homes[0].price, 460000);
      assert.ok(!copy.body.settings.mlsNumber);
      assert.equal(copy.body.settings.lenderName, 'Fine Lender', 'the lender carries over');
      const bad = await api('/api/admin/communities', { token: owner, method: 'POST', body: { kind: 'listing', address: '1 X St', price: '300000', copyFrom: 'nope' } });
      assert.equal(bad.status, 400);
    });
  });
}
