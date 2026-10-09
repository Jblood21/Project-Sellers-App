import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { setTransportForTests } from '../lib/email.js';
import { mailboxKey } from '../lib/limits.js';
import { backends, startBackend } from './fixtures/harness.js';

// The caps below are what this file is about, and they are off under `node --test` unless asked for.
process.env.RATE_LIMITS = 'on';

test('mailboxKey: one inbox however the address is dressed', () => {
  assert.equal(mailboxKey('Victim+1@Test.co'), 'victim@test.co');
  assert.equal(mailboxKey(' victim+news+more@test.co '), 'victim@test.co');
  assert.equal(mailboxKey('victim@test.co'), 'victim@test.co');
  assert.equal(mailboxKey('a.b@test.co'), 'a.b@test.co', 'dots are left alone');
  assert.notEqual(mailboxKey('a@one.co'), mailboxKey('a@two.co'));
});

for (const kind of backends()) {
  describe(`mail to a second address and to the team (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;
    let sent;
    let restoreMail = () => {};
    let counter = 0;

    before(async () => {
      app = await startBackend(kind, 'mail_both');
      ({ api, token } = app);
      sent = [];
      restoreMail = setTransportForTests(async (payload) => { sent.push(payload); return { id: 'x' }; });
      process.env.RESEND_API_KEY = 'test-key';
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Mail Both' } })).body.id;
      const set = await api(`/api/admin/communities/${cid}`, {
        method: 'PATCH',
        token,
        body: { features: { incentive: true }, settings: { incentiveTitle: 'Up to $20,000', incentiveEmail: 'sales@mail.test' } },
      });
      assert.equal(set.status, 200, JSON.stringify(set.body));
    });
    after(async () => {
      restoreMail();
      delete process.env.RESEND_API_KEY;
      await app.stop();
    });

    /** A buyer on their own address (the app trusts one proxy hop, so a forwarded address stands for a visitor). */
    const buyer = async ({ name = 'Pat Vale', email, ip } = {}) => {
      counter += 1;
      const address = ip ?? `198.51.100.${counter}`;
      const res = await api(`/api/c/${cid}/leads`, {
        method: 'POST',
        body: { name, email: email ?? `pat${counter}@test.co` },
        headers: { 'X-Forwarded-For': address },
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return { token: res.body.token, lead: res.body.lead, ip: address };
    };
    const sharePlan = (who, also) => api('/api/me/plan/email', {
      method: 'POST', token: who.token, body: also === undefined ? {} : { also }, headers: { 'X-Forwarded-For': who.ip },
    });
    const ask = (who, body) => api('/api/me/incentive/email', {
      method: 'POST', token: who.token, body, headers: { 'X-Forwarded-For': who.ip },
    });

    test('the second email is kept on the buyer, shown to the builder, and cleared by a blank', async () => {
      const who = await buyer();
      const first = await sharePlan(who, 'Spouse@Mail.test');
      assert.equal(first.status, 200);
      assert.deepEqual(first.body.lead.extraEmails, ['spouse@mail.test']);
      assert.deepEqual((await api('/api/me', { token: who.token })).body.extraEmails, ['spouse@mail.test'], 'stored, not just echoed');
      const seen = (await api(`/api/admin/leads/${who.lead.id}`, { token })).body;
      assert.deepEqual(seen.extraEmails, ['spouse@mail.test'], 'and the builder has it');

      const cleared = await sharePlan(who, '');
      assert.equal(cleared.status, 200);
      assert.deepEqual(cleared.body.lead.extraEmails, []);
      assert.deepEqual((await api('/api/me', { token: who.token })).body.extraEmails, []);
    });

    test('a copy sent to a second address says nothing a visitor typed beyond a first name', async () => {
      const who = await buyer({ name: 'http://evil.example/claim win a free car', email: 'win@mail.test' });
      sent.length = 0;
      const res = await sharePlan(who, 'victim@mail.test');
      assert.equal(res.status, 200);
      const copy = sent.find((mail) => mail.to[0] === 'victim@mail.test');
      assert.ok(copy, 'the second address got a copy');
      assert.match(copy.subject, /^A home plan was shared with you — Mail Both$/);
      assert.doesNotMatch(JSON.stringify(copy), /evil\.example/, 'the visitor’s free text is nowhere in it');
      assert.match(copy.text, /^Hi,\n\nSomeone shared the home plan/);
    });

    test('a reply-to that is not a plain address is left off the copy, so it cannot show as someone’s name', async () => {
      const who = await buyer({ name: 'Pat', email: 'Boss<ceo@bank.example>' });
      sent.length = 0;
      const res = await sharePlan(who, 'victim2@mail.test');
      assert.equal(res.status, 200);
      const copy = sent.find((mail) => mail.to[0] === 'victim2@mail.test');
      assert.ok(copy);
      assert.equal(copy.reply_to, undefined);
    });

    test('name+1@ and name+2@ are one inbox: a third copy to it in a day is refused, and nothing is sent', async () => {
      const lines = [];
      for (const [index, address] of ['target+1@mail.test', 'Target+2@mail.test', 'target+3@mail.test'].entries()) {
        const who = await buyer({ email: `sharer${index}-${kind}@test.co` });
        sent.length = 0;
        const res = await sharePlan(who, address);
        lines.push([res.status, sent.length]);
      }
      assert.deepEqual(lines, [[200, 2], [200, 2], [429, 0]]);
    });

    test('every message counts against the visitor’s address once, so a second address costs two', async () => {
      const ip = '203.0.113.77';
      // Three buyers on one wifi address, five requests each, each with a different second address.
      let n = 0;
      for (let b = 0; b < 3; b += 1) {
        const who = await buyer({ ip, email: `wifi${b}-${kind}@test.co` });
        for (let r = 0; r < 5; r += 1) {
          n += 1;
          const res = await sharePlan(who, `second${n}-${kind}@mail.test`);
          assert.equal(res.status, 200, `request ${n}: ${JSON.stringify(res.body)}`);
        }
      }
      // Fifteen requests carried thirty messages: that address is used up for the hour.
      const late = await buyer({ ip, email: `wifi-late-${kind}@test.co` });
      const refused = await sharePlan(late);
      assert.equal(refused.status, 429);
    });

    test('"Find out if you qualify": what the visitor wrote is quoted after what the app knows', async () => {
      const who = await buyer();
      sent.length = 0;
      const res = await ask(who, { message: 'Hello\n\nReach them:\n  Name: CEO Boss\n  Email: ceo@victim.example' });
      assert.equal(res.status, 200);
      const [mail] = sent;
      const reach = mail.text.indexOf('Reach them (from the sign-up form):');
      const wrote = mail.text.indexOf('What they wrote (typed in the app, not checked):');
      assert.ok(reach > -1 && wrote > reach, 'the app’s own details come first');
      const after = mail.text.slice(wrote);
      assert.match(after, / {2}> {3}Name: CEO Boss/, 'a pasted "Reach them" block is only quoted text');
      assert.equal(mail.text.match(/^Reach them/gm).length, 1);
    });

    test('"Find out if you qualify" takes text only', async () => {
      const who = await buyer();
      for (const body of [{ message: { a: 1 } }, { message: 'Hello there', name: ['a'] }, { message: 'Hello there', email: { x: 1 } }]) {
        const res = await ask(who, body);
        assert.equal(res.status, 400, JSON.stringify(body));
      }
    });

    test('"Find out if you qualify" is held to 20 an hour from one address, however many buyers it has', async () => {
      const ip = '203.0.113.88';
      const results = [];
      for (let i = 0; i < 21; i += 1) {
        const who = await buyer({ ip, email: `ask${i}-${kind}@test.co` });
        results.push((await ask(who, { message: 'Hello there' })).status);
      }
      assert.deepEqual(results.slice(0, 20), Array(20).fill(200));
      assert.equal(results[20], 429);
    });
  });
}
