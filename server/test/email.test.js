import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { emailConfigured, sendEmail, setTransportForTests } from '../lib/email.js';
import { notifyCallRequest, sendPlanToBuyer } from '../lib/notify.js';

let restore = () => {};
afterEach(() => {
  restore();
  restore = () => {};
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

/** Captures what would have gone out instead of sending it. */
function captureTransport() {
  const sent = [];
  restore = setTransportForTests(async (payload) => {
    sent.push(payload);
    return { id: 'test' };
  });
  process.env.RESEND_API_KEY = 'test-key';
  return sent;
}

const COMMUNITY = {
  id: 'willow', name: 'Willow Creek', settings: { notifyEmail: 'sales@builder.co' },
  homes: [{ id: 'h1', name: 'The Aspen', price: 429000 }],
};
const LEAD = {
  id: 'l1', name: 'Dana Cruz', email: 'dana@test.co', phone: '(801) 555-0123',
  savedHomeIds: ['h1'], plan: { afford: 'Looking at $350,049–$418,115' },
  tour: {
    slotId: 's1', date: '2026-09-20', time: '14:00', contact: 'phone',
    requestedAt: '2026-09-16T17:00:00.000Z',
  },
};
const store = { firstAdminEmail: async () => 'owner@builder.co' };

test('without an API key nothing is sent, and nothing throws', async () => {
  assert.equal(emailConfigured(), false);
  const result = await sendEmail({ to: 'a@b.co', subject: 'x', text: 'y' });
  assert.equal(result.sent, false);
  assert.match(result.skipped, /RESEND_API_KEY/);
});

test('a provider failure is reported, never thrown', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  restore = setTransportForTests(async () => { throw new Error('Resend responded 500'); });
  // The whole point: this resolves. A caller recording a lead must not be
  // unwound because a mail provider had a bad minute.
  const result = await sendEmail({ to: 'a@b.co', subject: 'x', text: 'y' });
  assert.equal(result.sent, false);
  assert.match(result.error, /500/);
});

test('the call alert leads with what the builder needs to act on', async () => {
  const sent = captureTransport();
  const result = await notifyCallRequest({
    store, community: COMMUNITY, lead: LEAD, baseUrl: 'https://cornerpost.example',
  });
  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);

  const [mail] = sent;
  assert.deepEqual(mail.to, ['sales@builder.co'], 'goes to the community address');
  assert.equal(mail.reply_to, 'dana@test.co', 'replying reaches the buyer');
  assert.match(mail.subject, /Dana Cruz booked Sun, Sep 20 at 2:00 PM/);
  assert.match(mail.subject, /Willow Creek/);

  // The first line has to carry the whole message, for a phone lock screen.
  assert.match(mail.text.split('\n')[0], /Dana Cruz booked Sun, Sep 20 at 2:00 PM · by phone\./);
  assert.match(mail.text, /Reach them by: Phone/, 'the chosen contact method leads');
  assert.match(mail.text, /\(801\) 555-0123/, 'the phone number is present');
  assert.match(mail.text, /The Aspen/, 'the homes they saved');
  assert.match(mail.text, /\$350,049/, 'and what they worked out');
  assert.match(mail.text, /cornerpost\.example\/admin\/leads\/l1/, 'and a link to the lead');
});

test('the alert falls back to the dashboard account when no address is set', async () => {
  const sent = captureTransport();
  await notifyCallRequest({
    store, community: { ...COMMUNITY, settings: { notifyEmail: '  ' } }, lead: LEAD,
  });
  assert.deepEqual(sent[0].to, ['owner@builder.co'], 'a builder who never set this still gets told');
});

test('with no admin at all the alert is skipped rather than failing', async () => {
  captureTransport();
  const result = await notifyCallRequest({
    store: { firstAdminEmail: async () => null },
    community: { ...COMMUNITY, settings: {} }, lead: LEAD,
  });
  assert.equal(result.sent, false);
  assert.equal(result.skipped, 'no admin address');
});

test('the buyer plan email goes to the buyer and carries their own numbers', async () => {
  const sent = captureTransport();
  const result = await sendPlanToBuyer({
    community: COMMUNITY, lead: LEAD, baseUrl: 'https://cornerpost.example',
  });
  assert.equal(result.sent, true);

  const [mail] = sent;
  assert.deepEqual(mail.to, ['dana@test.co'], 'to the buyer, not the builder');
  assert.match(mail.subject, /Your home plan — Willow Creek/);
  assert.match(mail.text, /^Hi Dana,/m, 'greets them by first name');
  assert.match(mail.text, /\$350,049/);
  assert.match(mail.text, /The Aspen — \$429,000/);
  assert.match(mail.text, /cornerpost\.example\/c\/willow/, 'links back into the app');
  assert.match(mail.text, /not a loan offer or a pre-approval/, 'the disclaimer travels with it');
});

test('a buyer with an empty plan still gets a coherent email', async () => {
  const sent = captureTransport();
  await sendPlanToBuyer({
    community: COMMUNITY,
    lead: { ...LEAD, plan: {}, savedHomeIds: [] },
    baseUrl: 'https://cornerpost.example',
  });
  const text = sent[0].text;
  assert.match(text, /Hi Dana,/);
  assert.doesNotMatch(text, /What you worked out:/, 'no empty heading');
  assert.doesNotMatch(text, /Homes you liked:/);
});

test('a request made before slots existed still renders', async () => {
  const sent = captureTransport();
  // Leads captured by the old free-text flow keep their wording rather than
  // rendering as a blank appointment.
  await notifyCallRequest({
    store,
    community: COMMUNITY,
    lead: { ...LEAD, tour: { time: 'This weekend', requestedAt: '2026-09-16T17:00:00.000Z' } },
  });
  assert.match(sent[0].subject, /Dana Cruz wants a call — Willow Creek/);
  assert.match(sent[0].text.split('\n')[0], /Dana Cruz booked This weekend\./);
});

test('the email preference puts the email address first', async () => {
  const sent = captureTransport();
  await notifyCallRequest({
    store, community: COMMUNITY,
    lead: { ...LEAD, tour: { ...LEAD.tour, contact: 'email' } },
  });
  const lines = sent[0].text.split('\n');
  const reach = lines.findIndex((l) => /Reach them by: Email/.test(l));
  assert.ok(reach > 0, 'it says how to reach them');
  assert.match(lines[reach + 1], /Email:\s+dana@test\.co/, 'and leads with the address, not the phone');
});
