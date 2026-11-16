import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { limitedPrivacyText, privacyBoxText, privacyLine } from '../../shared/domain.js';
import { setTransportForTests } from '../lib/email.js';
import { visitorEmail } from '../lib/visitorAlerts.js';
import { backends, startBackend } from './fixtures/harness.js';

delete process.env.RATE_LIMITS;

describe('the privacy words (shared)', () => {
  test('the box is about email, and about calls and texts too when there is a number', () => {
    assert.match(privacyBoxText('Acme Homes', false), /email me/);
    assert.doesNotMatch(privacyBoxText('Acme Homes', false), /call and text/);
    assert.match(privacyBoxText('Acme Homes', true), /call and text me/);
    assert.match(privacyBoxText('Acme Homes', true), /email me/);
  });

  test('the email-only terms say no calls and no texts, email only, and how to stop', () => {
    const text = limitedPrivacyText('Acme Homes');
    assert.match(text, /will not call or text/);
    assert.match(text, /email only/);
    assert.match(text, /Acme Homes/);
    assert.match(text, /stop emailing/);
  });

  test('one line says whether they ticked the box', () => {
    assert.match(privacyLine({ privacy: 'agreed', granted: true }, true), /ticked\. OK to email, call and text/);
    assert.match(privacyLine({ privacy: 'agreed', granted: false }, false), /ticked\. OK to email$/);
    assert.match(privacyLine({ privacy: 'email_only', granted: false }, true), /NOT ticked.*email-only terms.*do not call or text/);
    assert.match(privacyLine(null), /not asked/);
    assert.match(privacyLine({ privacy: '', granted: false }), /not asked/);
  });
});

for (const kind of backends()) {
  describe(`the privacy choice at sign-in (${kind} store)`, () => {
    let app;
    let api;
    let owner;
    let cid;
    const sent = [];
    let restore;
    const enter = (body) => api(`/api/c/${cid}/leads`, { method: 'POST', body });
    const records = async (leadId) => (await api(`/api/admin/leads/${leadId}/consents`, { token: owner })).body;

    before(async () => {
      app = await startBackend(kind, 'privacy-choice');
      ({ api, token: owner } = app);
      cid = (await api('/api/admin/communities', { token: owner, method: 'POST', body: { name: 'Privacy Place', builder: 'Acme Homes' } })).body.id;
      restore = setTransportForTests(async (mail) => { sent.push(mail); return { id: 'x' }; });
      process.env.RESEND_API_KEY = 'test-key';
    });
    after(async () => { restore?.(); delete process.env.RESEND_API_KEY; await app.stop(); });

    test('nobody gets in without ticking the box or accepting the email-only terms', async () => {
      for (const privacy of [undefined, '', 'no', 'AGREED', true, null]) {
        const res = await enter({ name: 'No Choice', email: 'nochoice@test.co', phone: '801-555-0100', privacy });
        assert.equal(res.status, 400, String(privacy));
        assert.match(res.body.error, /privacy box/);
      }
      const lead = (await api(`/api/admin/communities/${cid}/leads`, { token: owner })).body;
      assert.equal(lead.filter((l) => l.email === 'nochoice@test.co').length, 0, 'and nothing was made');
    });

    test('ticking the box gets in, records it with the words shown, and agrees to calls and texts when there is a number', async () => {
      const res = await enter({ name: 'Ticker', email: 'ticker@test.co', phone: '801-555-0101', privacy: 'agreed' });
      assert.equal(res.status, 201);
      assert.equal(res.body.lead.consent.privacy, 'agreed');
      assert.equal(res.body.lead.consent.granted, true);
      const [record] = await records(res.body.lead.id);
      assert.equal(record.privacy, 'agreed');
      assert.equal(record.text, privacyBoxText('Acme Homes', true), 'the stored words are the server\'s');
    });

    test('the email-only terms get in too, and never agree to calls or texts, whatever the caller says', async () => {
      const res = await enter({ name: 'Email Only', email: 'emailonly@test.co', phone: '801-555-0102', privacy: 'email_only', consent: true, text: 'anything' });
      assert.equal(res.status, 201);
      assert.equal(res.body.lead.consent.privacy, 'email_only');
      assert.equal(res.body.lead.consent.granted, false);
      const [record] = await records(res.body.lead.id);
      assert.equal(record.text, limitedPrivacyText('Acme Homes'));
      const admin = (await api(`/api/admin/leads/${res.body.lead.id}`, { token: owner })).body;
      assert.equal(admin.consent.granted, false, 'the lead screen says do not call');
    });

    test('with no number the choice is still kept', async () => {
      const res = await enter({ name: 'No Number', email: 'nonumber@test.co', privacy: 'agreed' });
      assert.equal(res.status, 201);
      assert.equal(res.body.lead.consent.privacy, 'agreed');
      assert.equal(res.body.lead.consent.granted, false);
    });

    test('a returning buyer who chooses the other way is recorded again, and the same way is not', async () => {
      const who = { name: 'Back Again', email: 'backagain@test.co', phone: '801-555-0103' };
      const first = await enter({ ...who, privacy: 'email_only' });
      assert.equal(first.status, 201);
      assert.equal((await enter({ ...who, privacy: 'email_only' })).status, 200);
      assert.equal((await records(first.body.lead.id)).length, 1, 'the same answer is not written twice');
      const ticked = await enter({ ...who, privacy: 'agreed' });
      assert.equal(ticked.status, 200);
      assert.equal(ticked.body.lead.consent.privacy, 'agreed');
      assert.equal((await records(first.body.lead.id)).length, 2);
      assert.equal((await enter({ ...who, privacy: 'email_only' })).status, 200);
      const lead = (await api(`/api/admin/leads/${first.body.lead.id}`, { token: owner })).body;
      assert.ok(lead.activity.some((a) => /Agreed to the privacy box, calls and texts/.test(a.text)), 'ticking it later is news');
      assert.ok(lead.activity.some((a) => /Chose the email-only terms/.test(a.text)), 'and so is going back to email only');
    });

    test('the emails the team gets say whether they ticked the box', async () => {
      sent.length = 0;
      const lead = { name: 'Mail Me', email: 'mailme@test.co', phone: '801-555-0104', consent: { privacy: 'email_only', granted: false } };
      assert.match(visitorEmail({ community: { id: 'c', name: 'Privacy Place' }, lead, baseUrl: '' }).text, /Privacy box: NOT ticked.*do not call or text/);
      const ticked = { ...lead, consent: { privacy: 'agreed', granted: true } };
      assert.match(visitorEmail({ community: { id: 'c', name: 'Privacy Place' }, lead: ticked, baseUrl: '' }).text, /Privacy box: ticked\. OK to email, call and text/);
      assert.match(visitorEmail({ community: { id: 'c', name: 'Privacy Place' }, lead: { ...lead, consent: null }, baseUrl: '' }).text, /Privacy box: not asked/);
    });

    test('the call-request email to the team carries it too', async () => {
      const entered = await enter({ name: 'Book Er', email: 'booker@test.co', phone: '801-555-0105', privacy: 'email_only' });
      const day = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
      const made = await api(`/api/admin/communities/${cid}/slots`, { token: owner, method: 'POST', body: { dates: [day], times: ['10:00'] } });
      const open = made.body.slots.filter((slot) => slot.time === '10:00');
      assert.ok(open.length, 'a time to book');
      sent.length = 0;
      const booked = await api('/api/me/tour', { method: 'POST', token: entered.body.token, body: { slotId: open[0].id, contact: 'email' } });
      assert.equal(booked.status, 200);
      const mail = sent.find((m) => /Privacy box/.test(`${m.text ?? ''}`));
      assert.ok(mail, 'the builder is told how they got in');
      assert.match(mail.text, /Privacy box: NOT ticked/);
    });
  });
}
