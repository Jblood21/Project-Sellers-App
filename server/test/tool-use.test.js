import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { PLAN_LABELS, TOOLS, TOOL_ORDER, toolAnswerOf, toolOfActivity, toolsOfferedBy, toolsUsedOf } from '../../shared/domain.js';
import { createFileStore } from '../db/file.js';
import { PG_URL, backends, startBackend } from './fixtures/harness.js';
import { pdfText } from './fixtures/pdfText.js';

const here = new URL('.', import.meta.url).pathname;

describe('which tool an action in the activity log belongs to', () => {
  const cases = [
    // opening a tool, by the name on its tile
    ...TOOLS.map((tool) => [`Opened ${tool.name}`, tool.k]),
    // working in a tool
    ['Opened payment for The Aspen', 'payment'], ['Explored FHA loan on payment tool', 'payment'], ['Tested 5% down on The Aspen', 'payment'],
    ['Explored Conventional loan', 'loans'], ['Compared VA', 'compare'], ['DPA screener: likely eligible', 'dpa'],
    ['Move-in driver: Lease ending', 'movein'], ['Added their own move-in step: Book movers', 'movein'], ['Move-in paying: cash', 'movein'],
    ['Wants to be moved in by 2027-03-01', 'movein'],
    // keeping what a tool worked out
    ['My Price Range saved: About $400,000', 'afford'], ['My Payment saved: $2,400 a month', 'payment'], ['My Loan Options saved: FHA', 'loans'],
    ['Compare My Options saved: FHA', 'compare'], ['Down Payment Help saved: May qualify', 'dpa'], ['My Savings Plan saved: $500 a month', 'savings'],
    ['My Move-In Plan saved: keys in March', 'movein'],
    // not tools
    ['Return visit', ''], ['Scanned QR — entered the app', ''], ['Saved The Aspen', ''], ['Homes I Like saved: The Aspen', ''],
    ['Opened the builder incentive', ''], ['Opened the site map', ''], ['Browsed Explore Homes', ''], ['Tapped Summit Home Loans', ''],
    ['Viewed The Aspen (3 photos)', ''], ['Read the guide: Buying with an agent', ''], ['Asked to schedule a tour', ''], ['', ''], [undefined, ''],
  ];
  for (const [text, key] of cases) {
    test(`${JSON.stringify(text)} is ${key ? `the ${key} tool` : 'not a tool'}`, () => assert.equal(toolOfActivity(text), key));
  }

  // The buyer app writes these lines and the stores read them back: if a tool's wording changes in one place and not
  // the other, the tool stops counting as used. Every line a tool's own screen logs has to be recognised as that tool.
  test('every line a tool screen writes is recognised as that tool', () => {
    const files = { 'Payment.jsx': 'payment', 'Loans.jsx': 'loans', 'Compare.jsx': 'compare', 'Dpa.jsx': 'dpa', 'MoveIn.jsx': 'movein' };
    let checked = 0;
    for (const [file, key] of Object.entries(files)) {
      const source = readFileSync(join(here, '../../client/src/buyer/tools', file), 'utf8');
      for (const [, quote, body] of source.matchAll(/track\((['`])((?:(?!\1)[^\\]|\\.)*)\1\)/g)) {
        // A loan program in the line stands for 'FHA'; anything else interpolated (a home's name, a percentage) for 'X'.
        const line = quote === '`' ? body.replace(/\$\{([^}]*)\}/g, (_, expression) => (/PROGRAMS/.test(expression) ? 'FHA' : 'X')) : body;
        assert.equal(toolOfActivity(line), key, `${file}: ${line}`);
        checked += 1;
      }
    }
    assert.ok(checked >= 8, `only ${checked} lines found: the pattern no longer matches the source`);
  });

  test('the screen that opens a tool says so, once, under the name on its tile', () => {
    const source = readFileSync(join(here, '../../client/src/buyer/BuyerContext.jsx'), 'utf8');
    assert.match(source, /`Opened \$\{tool\.name\}`/);
    assert.match(readFileSync(join(here, '../../client/src/buyer/tools/index.jsx'), 'utf8'), /toolOpened\(toolKey\)/);
  });
});

describe('the tools a community offers, and what a tool worked out', () => {
  test('every tool unless the builder switched it off', () => {
    assert.deepEqual(toolsOfferedBy({}), TOOL_ORDER);
    assert.deepEqual(toolsOfferedBy(null), TOOL_ORDER);
    assert.deepEqual(toolsOfferedBy({ tools: { dpa: false, savings: false, payment: true } }), TOOL_ORDER.filter((key) => key !== 'dpa' && key !== 'savings'));
  });
  test('the saved answer, or for the move-in tool the plan they saved', () => {
    assert.equal(toolAnswerOf({ plan: { afford: '  About $400,000 ' } }, 'afford'), 'About $400,000');
    assert.equal(toolAnswerOf({ plan: {} }, 'afford'), '');
    assert.equal(toolAnswerOf({ moveIn: { targetDate: '2027-03-01' } }, 'movein'), 'Move-in plan saved: keys by Mon, Mar 1, 2027');
    assert.equal(toolAnswerOf({ moveIn: { targetDate: '' } }, 'movein'), '', 'a plan with no date is a preview, not an answer');
    assert.equal(toolAnswerOf({ plan: { movein: 'Keys in March' }, moveIn: { targetDate: '2027-03-01' } }, 'movein'), 'Keys in March', 'a kept one-line answer wins');
    assert.equal(toolAnswerOf(null, 'movein'), '');
  });
});

describe('the tools a person used', () => {
  test('opened, worked in, saved or planned all count, in the app\'s order; nothing else does', () => {
    assert.deepEqual(toolsUsedOf({}), []);
    assert.deepEqual(toolsUsedOf(null), []);
    assert.deepEqual(toolsUsedOf({ toolUses: { loans: 2, payment: 1 } }), ['payment', 'loans']);
    assert.deepEqual(toolsUsedOf({ plan: { savings: 'x', afford: 'y' } }), ['afford', 'savings']);
    assert.deepEqual(toolsUsedOf({ toolUses: { payment: 1 }, plan: { payment: 'x', dpa: 'y' } }), ['payment', 'dpa'], 'each once');
    assert.deepEqual(toolsUsedOf({ moveIn: { targetDate: '2027-03-01' } }), ['movein']);
    assert.deepEqual(toolsUsedOf({ plan: { homes: 'The Aspen' }, toolUses: { homes: 4, '': 2, bogus: 1 } }), [], 'saved homes are not a tool');
    assert.deepEqual(toolsUsedOf({ toolUses: { payment: 0 } }), []);
  });
});

for (const kind of backends()) {
  describe(`tool use is recorded when a tool is used, not only when its answer is saved (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;

    before(async () => {
      app = await startBackend(kind, 'tool_use');
      ({ api, token } = app);
      cid = (await admin('/communities', { method: 'POST', body: { name: 'Tool Use' } })).body.id;
    });
    after(async () => {
      await app.stop();
    });

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const buyers = [];
    const signUp = async (name) => {
      const made = await api(`/api/c/${cid}/leads`, { method: 'POST', body: { name, email: `${name.replace(/\W/g, '').toLowerCase()}@tool.test`, phone: '' } });
      assert.equal(made.status, 201, JSON.stringify(made.body));
      buyers.push(made.body);
      return made.body;
    };
    const did = async (who, text) => assert.equal((await api('/api/me/activity', { method: 'POST', token: who.token, body: { text } })).status, 204);
    const uses = async (who) => (await admin(`/leads/${who.lead.id}`)).body.toolUses;
    const listed = async (who) => (await admin(`/communities/${cid}/leads`)).body.find((lead) => lead.id === who.lead.id);

    test('opening a tool is a use, on the list, on the person and for the reports, with nothing saved', async () => {
      const ola = await signUp('Opened Ola');
      await did(ola, 'Opened See My Payment');
      await did(ola, 'Explored FHA loan on payment tool');
      await did(ola, 'Opened Find My Loan Options');
      assert.deepEqual(await uses(ola), { payment: 2, loans: 1 });
      assert.deepEqual((await listed(ola)).toolUses, { payment: 2, loans: 1 }, 'the list a report is made from says the same');
      assert.deepEqual((await listed(ola)).plan, {}, 'and nothing was saved');
      assert.deepEqual(toolsUsedOf(await listed(ola)), ['payment', 'loans']);
    });

    test('saving an answer is a use too, and a person who did neither has none', async () => {
      const sam = await signUp('Saved Sam');
      const saved = await api('/api/me/plan/afford', { method: 'PUT', token: sam.token, body: { summary: 'About $400,000' } });
      assert.equal(saved.status, 200);
      assert.deepEqual(toolsUsedOf(await listed(sam)), ['afford']);
      const nan = await signUp('Nothing Nan');
      await did(nan, 'Browsed Explore Homes');
      await did(nan, 'Opened the site map');
      assert.deepEqual(await uses(nan), {});
      assert.deepEqual(toolsUsedOf(await listed(nan)), []);
    });

    test('what a buyer reads about themselves does not carry it', async () => {
      const bea = await signUp('Buyer Bea');
      await did(bea, 'Opened See My Payment');
      const me = await api('/api/me', { token: bea.token });
      assert.equal(me.status, 200);
      assert.ok(!('toolUses' in me.body));
    });

    test('the leads report PDF counts each tool by the people who used it', async () => {
      const res = await api(`/api/admin/communities/${cid}/reports/leads.pdf`, { token, raw: true });
      assert.equal(res.status, 200);
      const text = pdfText(Buffer.from(await res.arrayBuffer()));
      assert.ok(text.includes('TOOLS USED · PEOPLE WHO USED EACH'));
      assert.match(text, /My Payment\n[1-9]\d* of \d+\n/, 'someone who only opened it is counted');
      assert.ok(!/past their day|avg plan/i.test(text));
    });

    test('and the person\'s own PDF says used with nothing saved', async () => {
      const lee = await signUp('Opened Lee');
      await did(lee, 'Opened See What I Can Afford');
      const res = await api(`/api/admin/leads/${lee.lead.id}/report.pdf`, { token, raw: true });
      assert.equal(res.status, 200);
      const text = pdfText(Buffer.from(await res.arrayBuffer()));
      assert.ok(text.includes('Tools they used'));
      assert.match(text, /My Price Range\nUsed\. Nothing saved\./);
      assert.match(text, /My Payment\nNot used/);
    });
  });
}

describe('activity from before each line carried its tool is tagged when the store starts', () => {
  test('file store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'psa-tool-'));
    try {
      const path = join(dir, 'db.json');
      writeFileSync(path, JSON.stringify({
        leads: [{ id: 'l1', communityId: 'c1', name: 'Old Ola', email: 'ola@tool.test', status: 'new' }],
        activity: [
          { leadId: 'l1', text: 'Opened See My Payment', createdAt: '2026-01-01T00:00:00Z' },
          { leadId: 'l1', text: 'Explored FHA loan', createdAt: '2026-01-02T00:00:00Z' },
          { leadId: 'l1', text: 'Return visit', createdAt: '2026-01-03T00:00:00Z' },
          { leadId: 'l1', text: 'Opened the site map', createdAt: '2026-01-04T00:00:00Z', tool: '' },
        ],
      }));
      const store = createFileStore(path);
      await store.init();
      assert.deepEqual((await store.getLead('l1')).toolUses, { payment: 1, loans: 1 });
      assert.deepEqual((await store.listLeads('c1'))[0].toolUses, { payment: 1, loans: 1 });
      await store.addActivity('l1', 'Opened My Savings Plan');
      assert.deepEqual((await store.getLead('l1')).toolUses, { payment: 1, loans: 1, savings: 1 });
      await store.close?.();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('postgres store', { skip: !PG_URL }, async () => {
    const app = await startBackend('postgres', 'tool_backfill');
    const name = `tool_backfill_${process.pid}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const url = new global.URL(PG_URL);
    url.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      const cid = (await app.api('/api/admin/communities', { method: 'POST', token: app.token, body: { name: 'Backfill' } })).body.id;
      const made = await app.api(`/api/c/${cid}/leads`, { method: 'POST', body: { name: 'Old Ola', email: 'ola@tool.test', phone: '' } });
      const id = made.body.lead.id;
      // Rows as an older version of the app wrote them: no tool at all.
      await client.query(
        `INSERT INTO lead_activity (lead_id, text, tool) VALUES ($1,'Opened See My Payment',NULL), ($1,'Explored FHA loan',NULL), ($1,'Return visit',NULL)`,
        [id],
      );
      // More than one batch's worth (it tags 5,000 at a time), so a row at a batch's edge is not skipped.
      await client.query(`INSERT INTO lead_activity (lead_id, text, tool) SELECT $1, 'Opened My Savings Plan', NULL FROM generate_series(1, 5005)`, [id]);
      assert.deepEqual((await app.store.getLead(id)).toolUses, {}, 'untagged rows count for nothing until the store starts');
      await app.store.init();
      assert.deepEqual((await app.store.getLead(id)).toolUses, { payment: 1, loans: 1, savings: 5005 });
      assert.deepEqual((await app.store.listLeads(cid))[0].toolUses, { payment: 1, loans: 1, savings: 5005 });
      const left = await client.query(`SELECT count(*)::int AS n FROM lead_activity WHERE tool IS NULL`);
      assert.equal(left.rows[0].n, 0, 'every row is tagged, a line that is no tool with an empty tag');
      const label = await client.query(`SELECT tool FROM lead_activity WHERE text = 'Return visit'`);
      assert.equal(label.rows[0].tool, '');
    } finally {
      await client.end();
      await app.stop();
    }
  });
});

// The plan labels the reports use must exist for every tool the buyer app can open.
test('every tool has a plan label to be named by in a report', () => {
  for (const tool of TOOLS) assert.ok(PLAN_LABELS[tool.k], tool.k);
});
