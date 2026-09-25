import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { createPostgresStore } from '../db/pg.js';

const here = dirname(fileURLToPath(import.meta.url));
const LEGACY = readFileSync(join(here, 'fixtures/schema-legacy.sql'), 'utf8');

/**
 * These run only when a Postgres is reachable. CI provides one; a developer
 * working against the JSON file store is not blocked by their absence.
 *
 * They exist because a schema bug shipped that every other test was blind to:
 * `CREATE INDEX` on a column that an `ALTER` had not added yet. On a fresh
 * database the table definition supplied the column and everything passed. On
 * the production database the `CREATE TABLE IF NOT EXISTS` was a no-op, the
 * column was missing, and the server crash-looped on boot. Nothing in the suite
 * touched Postgres, so nothing caught it.
 */
const URL_ = process.env.TEST_DATABASE_URL;
const opts = URL_ ? {} : { skip: 'set TEST_DATABASE_URL to run the Postgres schema tests' };

/**
 * 'YYYY-MM-DD' a few days out. listOpenSlots only returns slots that have not
 * happened yet, so a hardcoded date stops exercising it the day it goes past —
 * this test was pinned to '2026-09-20' and went red on the 21st, in a suite
 * that had been green the evening before.
 */
const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Each case gets its own database so one failure cannot poison the next. */
async function withDatabase(name, fn) {
  const admin = new pg.Client({ connectionString: URL_ });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new global.URL(URL_);
  url.pathname = `/${name}`;
  try {
    await fn(url.toString());
  } finally {
    const cleanup = new pg.Client({ connectionString: URL_ });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await cleanup.end();
  }
}

const applyLegacy = async (url) => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(LEGACY);
  await client.end();
};

/** Boot the real store the way server/index.js does. */
const boot = async (url) => {
  const store = await createPostgresStore(url);
  try {
    await store.init();
  } finally {
    await store.close();
  }
};

test('the schema applies to a database created by an older release', opts, async () => {
  await withDatabase('schema_upgrade_test', async (url) => {
    await applyLegacy(url);
    // This is the production path, and the one that broke: tables already exist,
    // so every column added since has to arrive by ALTER before anything uses it.
    await boot(url);

    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const column = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'photos' AND column_name = 'highlight_id'`,
    );
    assert.equal(column.rowCount, 1, 'the ALTER added photos.highlight_id');
    const index = await client.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'photos_highlight_idx'`,
    );
    assert.equal(index.rowCount, 1, 'and the index on it was created');
    const table = await client.query(`SELECT 1 FROM pg_tables WHERE tablename = 'highlights'`);
    assert.equal(table.rowCount, 1, 'and the highlights table exists');
    const learn = await client.query(`SELECT 1 FROM pg_tables WHERE tablename = 'resources'`);
    assert.equal(learn.rowCount, 1, 'and so does the resources table');

    // Every column added by ALTER since the baseline has to land here too.
    for (const [tableName, columnName] of [
      ['homes', 'lot_number'], ['communities', 'features'],
      ['leads', 'opened_at'], ['leads', 'archived_at'],
    ]) {
      const added = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [tableName, columnName],
      );
      assert.equal(added.rowCount, 1, `${tableName}.${columnName} was added`);
    }
    await client.end();
  });
});

/**
 * The legacy fixture predates the highlights table, so on that path `address`
 * arrives with the CREATE TABLE and the ALTER is never exercised. The database
 * that actually needs the ALTER is the one that already has highlights from
 * before addresses existed — which is production. So build exactly that.
 */
test('a database whose highlights predate addresses gains the column', opts, async () => {
  await withDatabase('schema_address_test', async (url) => {
    await applyLegacy(url);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query(`
      CREATE TABLE highlights (
        id           TEXT PRIMARY KEY,
        community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
        category     TEXT NOT NULL DEFAULT 'other',
        name         TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        detail       TEXT NOT NULL DEFAULT '',
        position     INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await client.query(
      `INSERT INTO communities (id, name, location, status, theme, builder, settings, tools)
       VALUES ('c1', 'Willow Creek', 'Lehi, Utah', 'Now selling', 'navy', 'Hearthside', '{}', '{}')`,
    );
    await client.query(
      `INSERT INTO highlights (id, community_id, category, name) VALUES ('g1', 'c1', 'schools', 'Oakridge')`,
    );
    await client.end();

    await boot(url);

    const after = new pg.Client({ connectionString: url });
    await after.connect();
    const row = await after.query(`SELECT name, address FROM highlights WHERE id = 'g1'`);
    assert.equal(row.rows[0].name, 'Oakridge', 'the place the builder already wrote is untouched');
    assert.equal(row.rows[0].address, '', 'and it gains a blank address rather than a null one');
    await after.end();
  });
});

test('the schema applies to an empty database', opts, async () => {
  await withDatabase('schema_fresh_test', async (url) => {
    await boot(url);
  });
});

test('booting twice over the same database is a no-op', opts, async () => {
  await withDatabase('schema_repeat_test', async (url) => {
    await applyLegacy(url);
    await boot(url);
    // Render restarts the process on every deploy, so init() runs against its own
    // output constantly. Anything not guarded by IF NOT EXISTS shows up here.
    await boot(url);
    await boot(url);
  });
});

test('existing rows survive the upgrade', opts, async () => {
  await withDatabase('schema_data_test', async (url) => {
    await applyLegacy(url);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query(
      `INSERT INTO communities (id, name, location, status, theme, builder, settings, tools)
       VALUES ('c1', 'Willow Creek', 'Lehi, Utah', 'Now selling', 'estate', 'Hearthside', '{}', '{}')`,
    );
    await client.query(
      `INSERT INTO photos (id, community_id, kind, url) VALUES ('p1', 'c1', 'hero', 'https://x/y.jpg')`,
    );
    await client.end();

    await boot(url);

    const after = new pg.Client({ connectionString: url });
    await after.connect();
    const photo = await after.query(`SELECT highlight_id, url FROM photos WHERE id = 'p1'`);
    assert.equal(photo.rows[0].url, 'https://x/y.jpg', 'the photo is untouched');
    assert.equal(photo.rows[0].highlight_id, null, 'and its new column defaults to null');
    const community = await after.query(`SELECT name FROM communities WHERE id = 'c1'`);
    assert.equal(community.rows[0].name, 'Willow Creek');
    await after.end();
  });
});

test('a slot date survives Postgres unchanged', opts, async () => {
  await withDatabase('schema_slot_test', async (url) => {
    const store = await createPostgresStore(url);
    try {
      await store.init();
      const community = await store.createCommunity({ name: 'Slot Round Trip' });
      const date = futureDate(3);
      const [made] = await store.createSlots(community.id, [date], ['14:00']);

      // The literal the builder picked, not a timestamp re-rendered in whatever
      // zone the reader happens to be in. pg hands DATE back as a Date object,
      // which is exactly where a day can slip.
      assert.equal(made.date, date, 'the date comes back as written');
      assert.equal(made.time, '14:00');

      const [listed] = await store.listSlots(community.id);
      assert.equal(listed.date, date, 'and again when read back');

      const [open] = await store.listOpenSlots(community.id);
      assert.equal(open?.date, date, 'and it is still a slot a buyer could book');
    } finally {
      await store.close();
    }
  });
});

test('booking a slot is atomic under Postgres', opts, async () => {
  await withDatabase('schema_book_test', async (url) => {
    const store = await createPostgresStore(url);
    try {
      await store.init();
      const community = await store.createCommunity({ name: 'Booking Race' });
      const [slot] = await store.createSlots(community.id, ['2026-09-20'], ['14:00']);

      // Both buyers reach for the same slot at once. Exactly one may win — the
      // guard lives inside the UPDATE rather than in a read-then-write.
      const [a, b] = await Promise.all([
        store.bookSlot(slot.id, 'lead-a'),
        store.bookSlot(slot.id, 'lead-b'),
      ]);
      const winners = [a, b].filter(Boolean);
      assert.equal(winners.length, 1, 'one booking, not two');
      assert.equal((await store.listOpenSlots(community.id)).length, 0, 'and it leaves the menu');
    } finally {
      await store.close();
    }
  });
});

test('publishing the same availability twice does not duplicate it', opts, async () => {
  await withDatabase('schema_dupe_test', async (url) => {
    const store = await createPostgresStore(url);
    try {
      await store.init();
      const community = await store.createCommunity({ name: 'Dupes' });
      await store.createSlots(community.id, ['2026-09-20'], ['14:00', '15:00']);
      const second = await store.createSlots(community.id, ['2026-09-20'], ['14:00', '16:00']);
      assert.equal(second.length, 1, 'only the genuinely new time is added');
      assert.equal((await store.listSlots(community.id)).length, 3);
    } finally {
      await store.close();
    }
  });
});

test('two people can share an email once the unique index is gone', opts, async () => {
  await withDatabase('schema_identity_test', async (url) => {
    // Start from the old schema, where leads(community_id, lower(email)) was
    // UNIQUE. That constraint lives only in Postgres, so the file-store API
    // tests cannot see it — exactly the blind spot that broke production once.
    await applyLegacy(url);

    const store = await createPostgresStore(url);
    try {
      await store.init();
      const community = await store.createCommunity({ name: 'Shared Email' });

      const sam = await store.createLead(community.id, {
        name: 'Sam Rivera', email: 'shared@test.co', phone: '(801) 555-0111',
      });
      // Before the migration this line threw a unique violation.
      const jo = await store.createLead(community.id, {
        name: 'Jo Rivera', email: 'shared@test.co', phone: '(801) 555-0222',
      });
      assert.notEqual(jo.id, sam.id, 'both people exist');

      // And identity still picks the right one out of the pair.
      const foundSam = await store.findLeadByIdentity(community.id, {
        name: 'sam  rivera', email: 'SHARED@test.co', phone: '8015550111',
      });
      assert.equal(foundSam?.id, sam.id, 'matched Sam despite the formatting');

      const foundJo = await store.findLeadByIdentity(community.id, {
        name: 'Jo Rivera', email: 'shared@test.co', phone: '801-555-0222',
      });
      assert.equal(foundJo?.id, jo.id, 'and Jo, who shares the address');

      const stranger = await store.findLeadByIdentity(community.id, {
        name: 'Al Rivera', email: 'shared@test.co', phone: '(801) 555-0999',
      });
      assert.equal(stranger, null, 'and nobody for details that match neither');
    } finally {
      await store.close();
    }
  });
});

test('an older database gains the move-in plan without losing its homes', opts, async () => {
  await withDatabase('schema_movein_test', async (url) => {
    await applyLegacy(url);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query(
      `INSERT INTO communities (id, name, location, status, theme, builder, settings, tools)
       VALUES ('c1', 'Willow Creek', 'Lehi, Utah', 'Now selling', 'estate', 'Hearthside', '{}', '{}')`,
    );
    await client.query(
      `INSERT INTO homes (id, community_id, name, price, beds, baths, sqft, description, availability)
       VALUES ('h1', 'c1', 'The Cedar', 520000, 4, 3, 2400, 'Nice', 'Under Construction')`,
    );
    await client.end();

    await boot(url);

    const after = new pg.Client({ connectionString: url });
    await after.connect();
    // The home is still there, and its new column arrived empty rather than
    // asserting a completion date nobody set.
    const home = await after.query(`SELECT name, ready_on FROM homes WHERE id = 'h1'`);
    assert.equal(home.rows[0].name, 'The Cedar');
    assert.equal(home.rows[0].ready_on, '', 'no date until the builder sets one');
    const table = await after.query(
      `SELECT to_regclass('public.lead_movein') AS t`,
    );
    assert.ok(table.rows[0].t, 'the move-in table exists after the upgrade');
    await after.end();
  });
});

/**
 * The API tests run against the JSON file store, so the Postgres INSERT and
 * UPDATE for a highlight are not covered there — and Postgres is what
 * production runs. A column left out of the INSERT list is silent: the write
 * succeeds and the address is simply never stored.
 */
test('a highlight address round-trips through Postgres', opts, async () => {
  await withDatabase('schema_address_rt', async (url) => {
    const store = await createPostgresStore(url);
    try {
      await store.init();
      const community = await store.createCommunity({ name: 'Address Round Trip' });
      const made = await store.createHighlight(community.id, {
        category: 'schools', name: 'Oakridge Elementary', description: 'K–6',
        detail: '4 min drive', address: '1234 N Center St, Lehi, UT 84043',
      });
      assert.equal(made.address, '1234 N Center St, Lehi, UT 84043');

      const [listed] = await store.listHighlights(community.id);
      assert.equal(listed.address, '1234 N Center St, Lehi, UT 84043', 'and it survives the read back');

      const moved = await store.updateHighlight(made.id, { address: '99 Main St' });
      assert.equal(moved.address, '99 Main St');
      assert.equal(moved.name, 'Oakridge Elementary', 'the rest of the place is untouched');

      const cleared = await store.updateHighlight(made.id, { address: '' });
      assert.equal(cleared.address, '', 'clearing it is stored, not ignored as falsy');

      // A place added without one must not come back null: the buyer screen
      // reads it straight into a URL builder.
      const bare = await store.createHighlight(community.id, {
        category: 'other', name: 'The Creamery', description: '', detail: '',
      });
      assert.equal(bare.address, '');
    } finally {
      await store.close();
    }
  });
});

/**
 * The API tests run against the JSON file store, so the Postgres writes for a
 * video or an article are not covered there — and Postgres is production.
 */
test('videos and articles round-trip through Postgres', opts, async () => {
  await withDatabase('schema_resources_rt', async (url) => {
    const store = await createPostgresStore(url);
    try {
      await store.init();
      const community = await store.createCommunity({ name: 'Resources Round Trip' });

      const article = await store.createResource(community.id, {
        kind: 'article', title: 'What happens at closing', body: 'Line one.\nLine two.',
      });
      assert.equal(article.body, 'Line one.\nLine two.', 'newlines survive the column');
      assert.equal(article.url, '', 'an article comes back with a blank url, never null');

      const video = await store.createResource(community.id, {
        kind: 'video', title: 'A walk through', url: 'https://youtu.be/abc',
      });
      assert.equal(video.body, '');
      assert.equal(await store.countResourcesOfKind(community.id, 'video'), 1);
      assert.equal(await store.countResourcesOfKind(community.id, 'article'), 1);

      const listed = await store.listResources(community.id);
      assert.deepEqual(listed.map((r) => r.title), ['What happens at closing', 'A walk through'],
        'they come back in the order they were added');

      // An uploaded file, and the promise that listing resources never drags
      // its bytes out of the database — this payload goes to every buyer on
      // every page load.
      const uploaded = await store.createResource(community.id, {
        kind: 'video', title: 'Uploaded clip', contentType: 'video/mp4',
        data: Buffer.alloc(64 * 1024, 3).toString('base64'), sizeBytes: 64 * 1024,
      });
      assert.equal(uploaded.videoUrl, `/api/resources/${uploaded.id}/video`);
      assert.equal(uploaded.sizeBytes, 64 * 1024);

      // The shaped row never carries the file, whatever the query selected —
      // shapeResource builds an explicit field list, so this holds by
      // construction. What it does NOT prove is that the query avoided reading
      // the bytes out of Postgres in the first place; that is a column list in
      // pg.js, and its cost is invisible from here. Worth stating rather than
      // implying a guarantee this assertion cannot give.
      const withFile = await store.listResources(community.id);
      const row = withFile.find((r) => r.id === uploaded.id);
      assert.ok(!('data' in row), 'the listed row carries no file');
      assert.ok(JSON.stringify(withFile).length < 2000, 'and the list stays small');

      const bytes = await store.getResourceVideo(uploaded.id);
      assert.equal(bytes.content_type, 'video/mp4');
      assert.equal(Buffer.from(bytes.data, 'base64').length, 64 * 1024,
        'the file itself comes back whole from its own call');

      const edited = await store.updateResource(article.id, { title: 'Closing day' });
      assert.equal(edited.title, 'Closing day');
      assert.equal(edited.body, 'Line one.\nLine two.', 'and the rest is untouched');

      // Two videos exist by now — the linked one and the uploaded one — so
      // deleting one leaves the other rather than emptying the kind.
      assert.equal(await store.countResourcesOfKind(community.id, 'video'), 2);
      await store.deleteResource(video.id);
      assert.equal(await store.countResourcesOfKind(community.id, 'video'), 1);
      await store.deleteResource(uploaded.id);
      assert.equal(await store.countResourcesOfKind(community.id, 'video'), 0);
      assert.equal(await store.getResourceVideo(uploaded.id), null,
        'and the file goes with the row rather than being orphaned');
    } finally {
      await store.close();
    }
  });
});

test('a move-in plan round-trips through Postgres', opts, async () => {
  await withDatabase('schema_movein_rt', async (url) => {
    const store = await createPostgresStore(url);
    try {
      await store.init();
      const community = await store.createCommunity({ name: 'Move-In Round Trip' });
      const home = await store.createHome(community.id, {
        name: 'The Cedar', price: 520000, beds: 4, baths: 3, sqft: 2400,
        description: 'Nice', availability: 'Under Construction', readyOn: '2027-06-01',
      });
      assert.equal(home.readyOn, '2027-06-01', 'stored as the literal date it was given');

      const lead = await store.createLead(community.id, {
        name: 'Dana Reyes', email: 'dana@test.co', phone: '801-555-0114',
      });
      await store.saveMoveIn(lead.id, {
        homeId: home.id, targetDate: '2027-08-01', leaseEnd: '2027-08-15', payMethod: 'cash',
        drivers: ['lease'], done: ['offer'],
        ownSteps: [{ id: 'own1', label: 'Transfer utilities', date: '2027-07-28' }],
      });

      const read = await store.getLead(lead.id);
      assert.equal(read.moveIn.targetDate, '2027-08-01', 'no timezone shifted the date');
      assert.equal(read.moveIn.payMethod, 'cash');
      assert.deepEqual(read.moveIn.drivers, ['lease']);
      assert.deepEqual(read.moveIn.done, ['offer']);
      assert.equal(read.moveIn.ownSteps[0].label, 'Transfer utilities');

      // Saving again replaces the plan rather than stacking up rows.
      await store.saveMoveIn(lead.id, { targetDate: '2027-09-01', payMethod: 'loan' });
      const again = await store.getLead(lead.id);
      assert.equal(again.moveIn.targetDate, '2027-09-01');
      assert.deepEqual(again.moveIn.ownSteps, [], 'the replaced plan is the whole plan');
      assert.equal(again.moveIn.homeId, null);
    } finally {
      await store.close();
    }
  });
});
