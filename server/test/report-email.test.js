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
        { to: 'sales@report.test', comingUp: 1, overdue: 1, newPeople: 5, everyone: 5 },
        'to the saved address, whatever the request says',
      );

      assert.equal(sent.length, 1);
      const mail = lastMail();
      assert.deepEqual(mail.to, ['sales@report.test']);
      const name = (await admin(`/communities/${cid}`)).body.name;
      assert.equal(mail.subject, `${name}: 2 scheduled calls waiting, 5 new people`);
      assert.match(mail.text, /SCHEDULED CALLS WAITING \(2\)/);
      assert.match(mail.text, /— Quinn Past[^]*— Pat Vale/, 'one list, in the order of their day');
      assert.doesNotMatch(mail.text, /PAST THEIR DAY/i);
      assert.match(mail.text, /NEW PEOPLE SINCE THE LAST REPORT \(5\)/);
      assert.match(mail.text, new RegExp(`/admin/communities/${cid}/leads/${pat.lead.id}`), 'a link to each person');
      assert.match(mail.text, /Saved: The Aspen/);
      assert.ok(!/Sam Closed|sam@report\.test/.test(mail.text), 'a closed person is not in the email');
      assert.match(mail.text, /Everyone \(5 people\) is in the attached spreadsheet/);
      assert.ok(!/closed/i.test(mail.text), 'and the email does not mention anyone being closed');

      assert.equal(mail.attachments.length, 1);
      assert.match(mail.attachments[0].filename, /^report-main-\d+-leads-\d{4}-\d{2}-\d{2}\.csv$/);
      const csv = Buffer.from(mail.attachments[0].content, 'base64').toString('utf8');
      assert.ok(csv.startsWith('﻿Name,Email,'), 'a byte-order mark, then the header');
      assert.ok(csv.includes('\r\n'));
      const lines = csv.slice(1).trim().split('\r\n');
      assert.equal(lines.length, 6, 'the header and five people (a name with a line break would split a line; none has one)');
      assert.ok(!csv.includes('Sam Closed') && !csv.includes('sam@report.test'), 'the closed one is not in the spreadsheet either');
      assert.ok(!lines[0].split(',').includes('Closed'), 'and there is no closed column');
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

    test('someone who signs up while the mail is going out is new in the next report, never in neither', async () => {
      process.env.RATE_LIMITS = 'off';
      const cid = await fresh({ name: 'Report Midsend' });
      await signUp(cid, { name: 'Before Send', email: 'before@report.test' });
      let latecomer = null;
      restoreMail();
      restoreMail = setTransportForTests(async (payload) => {
        sent.push(payload);
        // The provider is slow to answer; in that time somebody scans the sign.
        latecomer = await signUp(cid, { name: 'During Send', email: 'during@report.test' });
        return { id: 'x' };
      });
      sent.length = 0;
      const first = await report(cid);
      assert.equal(first.status, 200);
      assert.doesNotMatch(lastMail().text, /During Send/, 'not in the one that was already being written');
      assert.ok(latecomer);
      restoreMail();
      restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });

      sent.length = 0;
      const second = await report(cid);
      assert.equal(second.status, 200);
      assert.equal(second.body.newPeople, 1);
      assert.match(lastMail().text, /During Send/, 'but in the next');
      assert.doesNotMatch(lastMail().text.split('NEW PEOPLE SINCE')[1], /Before Send/);
      delete process.env.RATE_LIMITS;
    });

    test('the time a report went out is saved on its own: a Setup save made meanwhile is kept, in both stores', async () => {
      const cid = await fresh({ name: 'Report Stamp' });
      await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { teamPhone: '(801) 555-0199', incentiveTitle: 'Hello there' } } });
      const stamped = await app.store.stampReportSent(cid, '2026-10-12T15:00:00.000Z');
      assert.equal(stamped.settings.reportLastSentAt, '2026-10-12T15:00:00.000Z');
      assert.equal(stamped.settings.reportEmail, 'sales@report.test');
      assert.equal(stamped.settings.teamPhone, '(801) 555-0199');
      assert.equal(stamped.settings.incentiveTitle, 'Hello there');
      assert.equal(await app.store.stampReportSent('no-such-community-abcd', '2026-10-12T15:00:00.000Z'), null);

      // A Setup save in the middle of a send: the stamp lands without undoing it.
      restoreMail();
      restoreMail = setTransportForTests(async (payload) => {
        sent.push(payload);
        const res = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { teamPhone: '(801) 555-0200' } } });
        assert.equal(res.status, 200);
        return { id: 'x' };
      });
      process.env.RATE_LIMITS = 'off';
      assert.equal((await report(cid)).status, 200);
      const after = await settingsOf(cid);
      assert.equal(after.teamPhone, '(801) 555-0200', 'the change made during the send survived');
      assert.ok(Date.parse(after.reportLastSentAt) > Date.parse('2026-10-12T15:00:00.000Z'));
      restoreMail();
      restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
      delete process.env.RATE_LIMITS;
    });

    test('if the time cannot be saved after the mail went out, it still says it went out', async () => {
      const cid = await fresh({ name: 'Report Unstamped' });
      const original = app.store.stampReportSent;
      app.store.stampReportSent = async () => { throw new Error('database went away'); };
      const quiet = console.error;
      console.error = () => {};
      try {
        sent.length = 0;
        const res = await report(cid);
        assert.equal(res.status, 200, 'the mail is out, so this is not a failure');
        assert.equal(res.body.sent, true);
        assert.equal(res.body.notRecorded, true);
        assert.equal(sent.length, 1);
      } finally {
        app.store.stampReportSent = original;
        console.error = quiet;
      }
    });

    test('a person the team closed who books a time again comes back, and is in the next report', async () => {
      const cid = await fresh({ name: 'Report Reopen' });
      const slots = (await admin(`/communities/${cid}/slots`, { method: 'POST', body: { dates: [dayIso(4)], times: ['10:00', '11:00'] } })).body.slots;
      const buyer = await signUp(cid, { name: 'Closed Carl', email: 'carl@report.test', phone: '(801) 555-0111' });
      await admin(`/leads/${buyer.lead.id}`, { method: 'PATCH', body: { archived: true } });
      assert.ok((await app.store.getLead(buyer.lead.id)).archivedAt);

      await book(cid, buyer, slots[0]);
      const lead = await app.store.getLead(buyer.lead.id);
      assert.equal(lead.archivedAt, null, 'booking a time reopens the lead');
      assert.ok(lead.tour);
      const activity = (await admin(`/leads/${buyer.lead.id}`)).body.activity.map((a) => a.text ?? a.label ?? a.summary ?? JSON.stringify(a)).join('\n');
      assert.match(activity, /Reopened/);

      process.env.RATE_LIMITS = 'off';
      sent.length = 0;
      assert.equal((await report(cid)).status, 200);
      assert.match(lastMail().text, /SCHEDULED CALLS WAITING \(1\)[\s\S]*Closed Carl/);
      delete process.env.RATE_LIMITS;
    });

    test('the rates webhook answers with the settings buyers see, not the team\'s private addresses', async () => {
      const cid = await fresh({ name: 'Report Rates' });
      await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { notifyEmail: 'alerts@report.test' } } });
      await app.store.stampReportSent(cid, '2026-10-12T15:00:00.000Z');
      process.env.RATES_WEBHOOK_SECRET = 'hook-secret';
      try {
        const res = await api(`/api/communities/${cid}/rates`, { method: 'POST', headers: { 'x-webhook-secret': 'hook-secret' }, body: { conv: '6.25' } });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.settings.rateConv, '6.25');
        assert.ok(res.body.settings.ratesUpdatedAt);
        const text = JSON.stringify(res.body);
        assert.ok(!text.includes('report.test'), 'no private address in the answer');
        for (const key of ['notifyEmail', 'reportEmail', 'reportLastSentAt']) assert.ok(!(key in res.body.settings), key);
        // The change itself did not touch them.
        const kept = await settingsOf(cid);
        assert.equal(kept.reportEmail, 'sales@report.test');
        assert.equal(kept.notifyEmail, 'alerts@report.test');
        assert.equal(kept.reportLastSentAt, '2026-10-12T15:00:00.000Z');
      } finally {
        delete process.env.RATES_WEBHOOK_SECRET;
      }
    });

    test('a community can email at most 30 reports a day, and gets the day back after it', async () => {
      process.env.RATE_LIMITS = 'on';
      const realNow = Date.now;
      let skipped = 0;
      Date.now = () => realNow() + skipped;
      try {
        const cid = await fresh({ name: 'Report Daily' });
        for (let i = 0; i < 30; i += 1) {
          const res = await report(cid);
          assert.equal(res.status, 200, `report ${i + 1}: ${JSON.stringify(res.body)}`);
          skipped += 16 * 1000; // past the double-click guard, well inside the day
        }
        const blocked = await report(cid);
        assert.equal(blocked.status, 429, 'the 31st in a day is held');
        assert.ok(Number(blocked.headers.get('retry-after')) > 60 * 60, 'and told to wait hours, not seconds');
        const other = await fresh({ name: 'Report Daily Other' });
        assert.equal((await report(other)).status, 200, 'another community has its own count');
        skipped += 24 * 60 * 60 * 1000;
        assert.equal((await report(cid)).status, 200, 'the next day it works again');
      } finally {
        Date.now = realNow;
        delete process.env.RATE_LIMITS;
      }
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
