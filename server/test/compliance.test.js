import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPLIANCE_DEFAULTS, LONG_SETTING_KEYS, complianceOf, complianceText, fillTokens, nmlsConsumerUrl,
  safeHref, settingMaxLength, telHref,
} from '../../shared/compliance.js';

const here = { year: 2026, community: { name: 'Willow Creek', builder: 'Acme Homes' } };

test('the defaults describe Summit Home Loans and name what a human still has to supply', () => {
  const c = complianceOf({}, here);
  assert.equal(c.lender.name, 'Summit Home Loans');
  assert.equal(c.lender.nmls, '1790749');
  assert.equal(c.lender.ready, true);
  assert.equal(c.lo, null, 'no individual is named until a community adds one');
  assert.match(c.license, /Utah Division of Real Estate, mortgage entity license #1337516\./);
  assert.equal(c.copyright, '© 2026 Summit Home Loans');
  // These are the things this module refuses to invent.
  assert.deepEqual(c.missing, ['privacy policy link', 'terms of use link', 'accessibility link']);
  assert.deepEqual(c.links.map((l) => l.key), ['nmls'], 'a link with no address is not printed');
});

test('the required statements are present, in order, with the lender named', () => {
  const { statements } = complianceOf({}, here);
  assert.deepEqual(statements.map((s) => s.key), ['ehl', 'notOffer', 'notAgent', 'disclaimer', 'rates']);
  const all = statements.map((s) => s.text).join('\n');
  assert.match(all, /Equal Housing Lender/);
  assert.match(all, /not an offer for credit/);
  assert.match(all, /Summit Home Loans is a mortgage lender\. It is not a real estate agent/);
  assert.match(all, /Not a commitment to lend/);
  assert.match(all, /APR may be higher/);
  assert.doesNotMatch(all, /undefined|\{|\}/);
});

test('a licence sentence with no number is flagged, a number clears it, and a blank statement drops out', () => {
  const noNumber = complianceOf({ lenderLicense: 'Licensed by the Utah Division of Real Estate.' }, here);
  assert.ok(noNumber.missing.includes('state licence number'));
  const c = complianceOf({ lenderLicense: 'Utah mortgage entity licence #1234567.', complianceRates: '' }, here);
  assert.ok(!c.missing.includes('state licence number'));
  assert.match(c.license, /1234567/);
  assert.ok(!c.statements.some((s) => s.key === 'rates'));
});

test('tokens are filled, and a typo is left visible rather than deleted', () => {
  assert.equal(
    fillTokens('{lender} / {nmls} / {lo} / {loNmls} / {community} / {builder}', {
      lender: 'L', nmls: '1', lo: 'A', loNmls: '2', community: 'C', builder: 'B',
    }),
    'L / 1 / A / 2 / C / B',
  );
  assert.equal(fillTokens('Hello {lendr}', { lender: 'L' }), 'Hello {lendr}');
  const c = complianceOf({ complianceAba: 'Ask {lender} about {builder}. {oops}' }, here);
  assert.equal(c.statements.find((s) => s.key === 'aba').text, 'Ask Summit Home Loans about Acme Homes. {oops}');
});

test('blanking the lender never prints "undefined" or an empty bullet', () => {
  const c = complianceOf({ lenderName: '', lenderNmls: '' }, here);
  assert.equal(c.lender.ready, false);
  assert.ok(c.missing.includes('lender name') && c.missing.includes('lender NMLS ID'));
  assert.equal(c.copyright, '© 2026 Willow Creek');
  assert.equal(c.nmlsHref, '');
  // Only printed text is checked for "null": the structured result legitimately holds `lo: null`.
  assert.doesNotMatch(JSON.stringify(c), /undefined/);
  assert.doesNotMatch(c.statements.map((s) => s.text).join(' ') + complianceText({ lenderName: '', lenderNmls: '' }, here), /undefined|null/);
});

test('a loan officer is only advertised with their own NMLS ID', () => {
  const c = complianceOf({ loName: 'Pat Doe', loNmls: '' }, here);
  assert.equal(c.lo, null);
  assert.ok(c.missing.includes('loan officer NMLS ID'));
});

test('only http and https addresses become links', () => {
  assert.equal(safeHref('summithomeloans.com'), 'https://summithomeloans.com/');
  assert.equal(safeHref(' https://a.example/x?y=1 '), 'https://a.example/x?y=1');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', 'ftp://a.example', 'vbscript:x', '//', '']) {
    assert.equal(safeHref(bad), '', bad);
  }
  const c = complianceOf({ lenderWebsite: 'javascript:alert(1)', compliancePrivacyUrl: 'data:text/html,x' }, here);
  assert.equal(c.lender.websiteHref, '');
  assert.ok(!c.links.some((l) => l.key === 'privacy'));
});

test('a phone number becomes a link only when it can be dialled exactly', () => {
  assert.equal(telHref('801-855-8535'), 'tel:+18018558535');
  assert.equal(telHref('(801) 855-8535'), 'tel:+18018558535');
  assert.equal(telHref('1-801-855-8535'), 'tel:+18018558535');
  assert.equal(telHref('+44 20 7946 0958'), 'tel:+442079460958');
  // A 7-digit local number and plain words cannot be dialled from anywhere.
  for (const bad of ['', '855-8535', 'call us', '555-0100 ext. 2']) assert.equal(telHref(bad), '', bad);
  // The old behaviour kept every digit, so these dialled a number nobody typed.
  assert.notEqual(telHref('801-855-8535 ext. 2'), 'tel:+80185585352');
  assert.equal(telHref('801-855-8535 ext. 2'), 'tel:+18018558535', 'the extension is cut, never appended');
  assert.equal(telHref('801-855-8535 / 801-555-0100'), 'tel:+18018558535');
  assert.equal(telHref('call us'), '');
});

test('the lender\'s loan team email defaults to Summit\'s, comes through complianceOf, and blank means none', () => {
  assert.equal(COMPLIANCE_DEFAULTS.lenderEmail, 'myloanteam@summithomeloans.com');
  assert.equal(complianceOf({}, here).lender.email, 'myloanteam@summithomeloans.com');
  assert.equal(complianceOf({ lenderEmail: '  loans@lender.example ' }, here).lender.email, 'loans@lender.example');
  assert.equal(complianceOf({ lenderEmail: '' }, here).lender.email, '', 'cleared in Setup, it stays cleared');
});

test('the loan application link is the lender\'s, only ever http(s), and blank hides it', () => {
  assert.ok(safeHref(COMPLIANCE_DEFAULTS.loanApplicationUrl), 'the default is a link a buyer can follow');
  assert.equal(complianceOf({}, here).lender.applyHref, safeHref(COMPLIANCE_DEFAULTS.loanApplicationUrl));
  assert.equal(complianceOf({ loanApplicationUrl: '' }, here).lender.applyHref, '', 'clearing the field hides every link');
  assert.equal(complianceOf({ loanApplicationUrl: ' https://apply.example.com/loan?x=1 ' }, here).lender.applyHref,
    'https://apply.example.com/loan?x=1');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.example', 'vbscript:x']) {
    assert.equal(complianceOf({ loanApplicationUrl: bad }, here).lender.applyHref, '', bad);
  }
  // The realtor notice and fair housing line this module used to carry are gone.
  assert.ok(!('agentsNote' in COMPLIANCE_DEFAULTS) && !('agentsEhoLine' in COMPLIANCE_DEFAULTS));
  assert.ok(!('agentsNote' in complianceOf({}, here)) && !('agentsEhoLine' in complianceOf({}, here)));
});

test('the NMLS Consumer Access address is built from digits only', () => {
  assert.equal(nmlsConsumerUrl('1790749'), 'https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/1790749');
  assert.equal(nmlsConsumerUrl('#1790749'), 'https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/1790749');
  assert.equal(nmlsConsumerUrl('../evil'), '');
  assert.equal(nmlsConsumerUrl(''), '');
});

test('every default setting has a length cap, and the statements get the longer one', () => {
  for (const key of Object.keys(COMPLIANCE_DEFAULTS)) {
    assert.ok(settingMaxLength(key) >= 300, key);
  }
  for (const key of LONG_SETTING_KEYS) assert.equal(settingMaxLength(key), 4000);
  assert.equal(settingMaxLength('lenderName'), 300);
  assert.ok(LONG_SETTING_KEYS.includes('complianceEhl'));
});

test('the plain-text footer says what the page says', () => {
  const c = complianceOf({}, here);
  const t = complianceText({}, here);
  for (const s of c.statements) assert.ok(t.includes(s.text), s.key);
  assert.ok(t.includes(c.nmlsHref));
  assert.ok(t.includes('mortgage entity license #1337516'));
  assert.ok(!t.includes('Loan officer:'), 'no loan officer line until a community names one');
  const named = complianceText({ loName: 'Pat Doe', loNmls: '123456' }, here);
  assert.ok(named.includes('Loan officer: Pat Doe · NMLS #123456'));
});

test('a tour names the lender the community chose, not the built-in default', async () => {
  const { describeTour, lenderNameOf } = await import('../../shared/domain.js');
  const tour = { date: '2030-05-04', time: '10:00', contact: 'phone', topic: 'lender' };
  assert.match(describeTour(tour), /Summit Home Loans/, 'the default is unchanged for callers that pass nothing');
  assert.match(describeTour(tour, 'Acme Lending'), /about financing \(Acme Lending\)/);
  assert.equal(lenderNameOf({ settings: { lenderName: 'Acme Lending' } }), 'Acme Lending');
  assert.equal(lenderNameOf({ settings: { lenderName: '  ' } }), 'the lender', 'a cleared name never reverts to Summit');
  assert.equal(lenderNameOf({}), 'Summit Home Loans');
});

test('a blanked required statement is listed as needing attention, not published silently', () => {
  const cleared = complianceOf({
    complianceEhl: '', complianceNotOffer: '  ', complianceNotAgent: '',
  }, here);
  for (const label of [
    'Equal Housing statement', 'not an offer for credit statement', 'not a real estate agent statement',
  ]) {
    assert.ok(cleared.missing.includes(label), `${label} is flagged`);
  }
  assert.deepEqual(cleared.statements.map((s) => s.key), ['disclaimer', 'rates'], 'and they are not printed');
  // Only the one that was cleared is flagged, and the defaults flag none of them.
  const one = complianceOf({ complianceNotOffer: '' }, here);
  assert.deepEqual(one.missing.filter((m) => /statement$/.test(m)), ['not an offer for credit statement']);
  assert.ok(!complianceOf({}, here).missing.some((m) => /statement$/.test(m)));
});

test('the starter FAQ is complete, fits its limits, is plain text and promises nothing', async () => {
  const {
    DEFAULT_FAQ, DEFAULT_FAQ_JSON, FAQ_ANSWER_MAX, FAQ_MAX_ITEMS, FAQ_QUESTION_MAX, normalizeFaqJson, parseFaq,
  } = await import('../../shared/faq.js');
  const { DEFAULT_SETTINGS } = await import('../../shared/domain.js');
  assert.ok(DEFAULT_FAQ.length >= 5 && DEFAULT_FAQ.length <= FAQ_MAX_ITEMS);
  for (const item of DEFAULT_FAQ) {
    assert.ok(item.q.endsWith('?'), `a question: ${item.q}`);
    assert.ok(item.q.length <= FAQ_QUESTION_MAX && item.a.length <= FAQ_ANSWER_MAX, item.q);
    assert.ok(!/[<>{}]/.test(`${item.q} ${item.a}`), `plain text, no markup or tokens: ${item.q}`);
  }
  assert.equal(new Set(DEFAULT_FAQ.map((item) => item.q)).size, DEFAULT_FAQ.length, 'no question twice');
  // Nothing stored is cut short or dropped on the way in.
  assert.deepEqual(parseFaq(DEFAULT_FAQ_JSON), DEFAULT_FAQ);
  assert.equal(normalizeFaqJson(DEFAULT_FAQ_JSON), DEFAULT_FAQ_JSON);
  assert.equal(DEFAULT_SETTINGS.faqJson, DEFAULT_FAQ_JSON, 'a new community starts with them');
  // No rate, dollar amount or approval is promised, and no lender or agent is named.
  const all = DEFAULT_FAQ.map((item) => `${item.q} ${item.a}`).join(' ');
  assert.ok(!/\d+(\.\d+)?\s*%|\$\s*\d|guarantee|pre-?approv|summit|nmls/i.test(all), 'no rate, price, guarantee or lender name');
  assert.match(all, /not a loan approval or an offer to lend/);
});

test('FAQ helpers keep only text, never throw, and refuse what is not a list', async () => {
  const { parseFaq, serializeFaq, normalizeFaqJson } = await import('../../shared/faq.js');
  assert.deepEqual(parseFaq(JSON.stringify([{ q: { x: 1 }, a: 'a' }, { q: 'Q?', a: ' A ' }, null, 'x', { q: 'Only', a: '' }])), [{ q: 'Q?', a: 'A' }]);
  assert.deepEqual(parseFaq('not json'), []);
  assert.deepEqual(parseFaq(undefined), []);
  assert.equal(serializeFaq([{ q: 'Q?', a: 'A' }]), '[{"q":"Q?","a":"A"}]');
  assert.equal(normalizeFaqJson(`${'['.repeat(100000)}${']'.repeat(100000)}`), '[]', 'nested far too deep is a list with nothing usable, and does not throw');
  assert.equal(normalizeFaqJson('{"q":"x"}'), null);
  assert.equal(normalizeFaqJson('  '), '[]');
});
