import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { setTransportForTests } from '../lib/email.js';
import { backends, startBackend } from './fixtures/harness.js';

const pad = (n) => String(n).padStart(2, '0');
const dayIso = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

for (const kind of backends()) {
  describe(`the lead report email (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let sent;
    let restoreMail = () => {};
    let counter = 0;

    before(async () => {
      app = await startBackend(kind, 'report_email');
      ({ api, token } = app);
      sent = [];
      restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
      process.env.RESEND_API_KEY = 'test-key';
      process.env.EMAIL_FROM = 'Touradoor <hello@report.test>';
    });
    after(async () => {
      restoreMail();
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
      delete process.env.RATE_LIMITS;
      await app.stop();
    });

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    /** A community of its own, so no test shares a send limit or "since" stamp with another. */
    const fresh = async ({ name = 'Report Test', address = 'sales@report.test' } = {}) => {
      counter += 1;
      const created = (await admin('/communities', { method: 'POST', body: { name: `${name} ${counter}` } })).body;
      if (address) {
        const set = await admin(`/communities/${created.id}`, { method: 'PATCH', body: { settings: { reportEmail: address } } });
        assert.equal(set.status, 200, JSON.stringify(set.body));
      }
      return created.id;
    };
    const signUp = async (cid, who) => {
      const res = await api(`/api/c/${cid}/leads`, { method: 'POST', body: who });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body;
    };
    const book = async (cid, buyer, slot) => {
      const res = await api('/api/me/tour', { method: 'POST', token: buyer.token, body: { slotId: slot.id, contact: 'phone' } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    };
    const report = (cid, opts = {}) => admin(`/communities/${cid}/report`, { method: 'POST', body: {}, ...opts });
    const settingsOf = async (cid) => (await admin(`/communities/${cid}`)).body.settings;
    const lastMail = () => sent[sent.length - 1];

    test('the report address is the builder\'s alone: one address, never public, and a Setup save cannot move the stamp', async () => {
      const cid = await fresh({ address: '' });
      for (const bad of ['a@b.co, c@d.co', 'no-at', 'a@b.co?bcc=x@y.z', 'a b@c.co', `${'x'.repeat(250)}@b.co`]) {
        const res = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { reportEmail: bad } } });
        assert.equal(res.status, 400, bad);
        assert.match(res.body.error, /report email/);
      }
      const ok = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { reportEmail: ' Sales@Report.test ' } } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.settings.reportEmail, 'Sales@Report.test', 'trimmed, otherwise as typed');

      const page = await api(`/api/c/${cid}`);
      assert.equal(page.status, 200);
      assert.ok(!('reportEmail' in page.body.settings) && !('reportLastSentAt' in page.body.settings), 'a buyer is never served it');
      assert.ok(!JSON.stringify(page.body).includes('report.test'));

      const forged = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { reportLastSentAt: '2020-01-01T00:00:00.000Z' } } });
      assert.equal(forged.status, 200);
      assert.equal((await settingsOf(cid)).reportLastSentAt, '', 'the stamp is the server\'s to set');

      const cleared = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { reportEmail: '' } } });
      assert.equal(cleared.body.settings.reportEmail, '');
    });

    test('nothing is sent without a saved address, without email, without sign-in, or for a community that is not there', async () => {
      sent.length = 0;
      const none = await fresh({ address: '' });
      const noAddress = await report(none);
      assert.equal(noAddress.status, 400);
      assert.match(noAddress.body.error, /report email/i);

      const cid = await fresh();
      const key = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      const off = await report(cid);
      process.env.RESEND_API_KEY = key;
      assert.equal(off.status, 503);
      assert.match(off.body.error, /not set up/i);

      assert.equal((await api(`/api/admin/communities/${cid}/report`, { method: 'POST', body: {} })).status, 401);
      assert.equal((await report('no-such-community-abcd')).status, 404);
      assert.equal(sent.length, 0);
      assert.equal((await settingsOf(cid)).reportLastSentAt, '', 'and nothing was stamped');
    });

    test('the report lists the calls waiting and the new people, and attaches everyone', async () => {
      const cid = await fresh({ name: 'Report Main' });
      const home = (await admin(`/communities/${cid}/homes`, { method: 'POST', body: { name: 'The Aspen', price: 400000 } })).body;
      const slots = (await admin(`/communities/${cid}/slots`, { method: 'POST', body: { dates: [dayIso(3)], times: ['10:00', '11:00', '12:00'] } })).body.slots;

      const pat = await signUp(cid, { name: 'Pat Vale', email: 'pat@report.test', phone: '(801) 555-0101' });
      await api('/api/me/saves', { method: 'POST', token: pat.token, body: { homeId: home.id } });
      await book(cid, pat, slots[0]);
      const quinn = await signUp(cid, { name: 'Quinn Past', email: 'quinn@report.test', phone: '(801) 555-0102' });
      await app.store.updateLead(quinn.lead.id, {
        tour: { slotId: null, date: dayIso(-2), time: '10:00', contact: 'phone', topic: 'community', requestedAt: new Date().toISOString() },
      });
      const rae = await signUp(cid, { name: 'Rae Handled', email: 'rae@report.test', phone: '(801) 555-0103' });
      await book(cid, rae, slots[1]);
      await admin(`/leads/${rae.lead.id}`, { method: 'PATCH', body: { tourHandled: true } });
      const sam = await signUp(cid, { name: 'Sam Closed', email: 'sam@report.test', phone: '(801) 555-0104' });
      await book(cid, sam, slots[2]);
      await admin(`/leads/${sam.lead.id}`, { method: 'PATCH', body: { archived: true } });
      await signUp(cid, { name: '=HYPERLINK("http://evil.example","x")', email: 'evil@report.test' });
      await signUp(cid, { name: 'Last, First "Q"', email: 'comma@report.test' });

      sent.length = 0;
      const res = await report(cid, { body: { to: 'victim@elsewhere.test' } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(
        { to: res.body.to, comingUp: res.body.comingUp, overdue: res.body.overdue, newPeople: res.body.newPeople, everyone: res.body.everyone },
        { to: 'sales@report.test', comingUp: 1, overdue: 1, newPeople: 5, everyone: 6 },
        'to the saved address, whatever the request says',
      );

      assert.equal(sent.length, 1);
      const mail = lastMail();
      assert.deepEqual(mail.to, ['sales@report.test']);
      const name = (await admin(`/communities/${cid}`)).body.name;
      assert.equal(mail.subject, `${name}: 2 scheduled calls waiting, 5 new people`);
      assert.match(mail.text, /SCHEDULED CALLS WAITING \(1\)/);
      assert.match(mail.text, /Pat Vale/);
      assert.match(mail.text, /PAST THEIR DAY AND NOT MARKED HANDLED \(1\)\n {2}.* — Quinn Past/);
      assert.match(mail.text, /NEW PEOPLE SINCE THE LAST REPORT \(5\)/);
      assert.match(mail.text, new RegExp(`/admin/communities/${cid}/leads/${pat.lead.id}`), 'a link to each person');
      assert.match(mail.text, /Saved: The Aspen/);
      assert.ok(!/Sam Closed/.test(mail.text), 'a closed person is in the spreadsheet only');
      assert.match(mail.text, /Everyone \(6 people, 1 closed\) is in the attached spreadsheet/);

      assert.equal(mail.attachments.length, 1);
      assert.match(mail.attachments[0].filename, /^report-main-\d+-leads-\d{4}-\d{2}-\d{2}\.csv$/);
      const csv = Buffer.from(mail.attachments[0].content, 'base64').toString('utf8');
      assert.ok(csv.startsWith('﻿Name,Email,'), 'a byte-order mark, then the header');
      assert.ok(csv.includes('\r\n'));
      const lines = csv.slice(1).trim().split('\r\n');
      assert.equal(lines.length, 7, 'the header and six people (a name with a line break would split a line; none has one)');
      assert.ok(lines.some((l) => l.startsWith('Sam Closed,sam@report.test') && /,Yes,http/.test(l)), 'the closed one is there, marked');
      assert.ok(lines.some((l) => l.startsWith(`"'=HYPERLINK(""http://evil.example"",""x"")",evil@report.test`)), 'a formula typed as a name is plain text');
      assert.ok(lines.some((l) => l.startsWith('"Last, First ""Q""",comma@report.test')), 'commas and quotes are quoted');
      assert.ok(lines.some((l) => l.startsWith('Rae Handled') && /,Handled,/.test(l)));

      const stamp = (await settingsOf(cid)).reportLastSentAt;
      assert.ok(!Number.isNaN(Date.parse(stamp)), 'the time it went out is kept');
      assert.equal(res.body.at, stamp);
    });

    test('the next report lists only who is new, and a send that failed moves nothing', async () => {
      process.env.RATE_LIMITS = 'off';
      const cid = await fresh({ name: 'Report Next' });
      await signUp(cid, { name: 'First Person', email: 'first@report.test' });
      sent.length = 0;
      assert.equal((await report(cid)).status, 200);
      const stamp = (await settingsOf(cid)).reportLastSentAt;
      assert.match(lastMail().text, /This is the first report/);
      assert.match(lastMail().text, /NEW PEOPLE SINCE THE LAST REPORT \(1\)/);

      await new Promise((resolve) => setTimeout(resolve, 15));
      const second = await signUp(cid, { name: 'Second Person', email: 'second@report.test' });
      // The provider refuses: the buyer-facing app is unaffected, the report says so, and the stamp stays put.
      restoreMail();
      restoreMail = setTransportForTests(async () => { throw new Error('provider down'); });
      const failed = await report(cid);
      assert.equal(failed.status, 503);
      assert.match(failed.body.error, /could not be sent/i);
      assert.equal((await settingsOf(cid)).reportLastSentAt, stamp, 'not marked as sent');
      restoreMail();
      restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });

      sent.length = 0;
      const again = await report(cid);
      assert.equal(again.status, 200);
      assert.equal(again.body.newPeople, 1, 'the one who signed up since, and no one twice');
      assert.match(lastMail().text, /The last report went out/);
      assert.match(lastMail().text, /Second Person/);
      assert.doesNotMatch(lastMail().text.split('NEW PEOPLE SINCE')[1], /First Person/, 'the first one is not listed again');
      assert.ok(Date.parse((await settingsOf(cid)).reportLastSentAt) > Date.parse(stamp));
      assert.ok(second);
      delete process.env.RATE_LIMITS;
    });

    test('with no sender set up it says why a send fails, and it cannot be pressed twice in a breath', async () => {
      process.env.RATE_LIMITS = 'on';
      try {
        const cid = await fresh({ name: 'Report Burst' });
        const first = await report(cid);
        assert.equal(first.status, 200);
        const second = await report(cid);
        assert.equal(second.status, 429, 'a double click does not send it twice');
        assert.ok(Number(second.headers.get('retry-after')) >= 1);

        // A failed send gives its use back, so the person can press again at once.
        const other = await fresh({ name: 'Report Retry' });
        restoreMail();
        restoreMail = setTransportForTests(async () => { throw new Error('provider down'); });
        delete process.env.EMAIL_FROM;
        const failed = await report(other);
        assert.equal(failed.status, 503);
        assert.match(failed.body.error, /test address/i, 'the usual cause is named');
        restoreMail();
        restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
        process.env.EMAIL_FROM = 'Touradoor <hello@report.test>';
        assert.equal((await report(other)).status, 200);
      } finally {
        delete process.env.RATE_LIMITS;
      }
    });
  });
}
