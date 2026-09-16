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

    // Every column added by ALTER since the baseline has to land here too.
    for (const [tableName, columnName] of [['homes', 'lot_number'], ['communities', 'features']]) {
      const added = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [tableName, columnName],
      );
      assert.equal(added.rowCount, 1, `${tableName}.${columnName} was added`);
    }
    await client.end();
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
