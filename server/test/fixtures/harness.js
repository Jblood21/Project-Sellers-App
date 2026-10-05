import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg from 'pg';

import { createFileStore } from '../../db/file.js';
import { resetStoreForTests } from '../../db/index.js';
import { createPostgresStore } from '../../db/pg.js';
import { hashPassword } from '../../lib/auth.js';
import { createApp } from '../../index.js';

/**
 * Shared scaffolding for the tests that drive the real HTTP API against BOTH
 * stores. The two stores are meant to be interchangeable and a hand-written pair
 * is exactly where they drift apart, so the realtor and guide tests are written
 * once and run against each: the JSON file store always, and a throwaway
 * Postgres database when TEST_DATABASE_URL is set.
 */
export const PG_URL = process.env.TEST_DATABASE_URL;

/** The backends to run a suite against. */
export const backends = () => (PG_URL ? ['file', 'postgres'] : ['file']);

/** A real, tiny GIF: what the existing tests upload, and what the allow-list accepts. */
export const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const adminDb = async (fn) => {
  const client = new pg.Client({ connectionString: PG_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

/**
 * Boots the app on `kind` and returns an `api()` caller, an admin token, the
 * store itself and a `stop()`. `label` names the throwaway database.
 */
export async function startBackend(kind, label) {
  process.env.SESSION_SECRET = 'test-secret';
  let dir = null;
  let dbName = null;
  let store;

  if (kind === 'postgres') {
    dbName = `${label}_${process.pid}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    await adminDb(async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await c.query(`CREATE DATABASE ${dbName}`);
    });
    const url = new global.URL(PG_URL);
    url.pathname = `/${dbName}`;
    store = createPostgresStore(url.toString());
  } else {
    dir = mkdtempSync(join(tmpdir(), 'psa-test-'));
    store = createFileStore(join(dir, 'db.json'));
  }

  await resetStoreForTests(store);
  await store.createAdmin({ email: 'admin@test.co', passwordHash: hashPassword('pw123456') });
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const api = async (path, { method = 'GET', body, token, raw } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined || method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
    });
    if (raw) return res;
    // Images and other non-JSON answers come back with a null body: tests that
    // care about the bytes ask for `raw`.
    const isJson = /json/.test(res.headers.get('content-type') ?? '');
    const text = isJson ? await res.text() : (await res.arrayBuffer(), '');
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };

  const login = await api('/api/admin/login', {
    method: 'POST', body: { email: 'admin@test.co', password: 'pw123456' },
  });

  return {
    api, store, token: login.body.token,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await store.close();
      await resetStoreForTests(null);
      if (dir) rmSync(dir, { recursive: true, force: true });
      if (dbName) await adminDb((c) => c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`));
    },
  };
}
