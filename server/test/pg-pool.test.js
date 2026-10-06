import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { PG_URL, startBackend } from './fixtures/harness.js';

/**
 * When Postgres ends a connection the app is only holding idle (a restart, a
 * failover, a maintenance window, a test database being dropped), the pool emits
 * an 'error' event. With no listener Node treats that as an uncaught exception and
 * the whole server exits; the same thing has failed whole test files at random.
 * The pool must log it, discard that connection and open a new one for the next query.
 */
describe('postgres connection loss', { skip: !PG_URL }, () => {
  let app;
  before(async () => {
    app = await startBackend('postgres', 'pool_loss');
  });
  after(() => app.stop());

  test('an idle connection the database ends is logged, not fatal, and the store keeps working', async (t) => {
    const logged = [];
    t.mock.method(console, 'error', (...args) => logged.push(args.join(' ')));

    // Several requests at once, so the pool is holding more than one idle connection.
    const listed = () => app.api('/api/admin/communities', { token: app.token });
    for (const res of await Promise.all([listed(), listed(), listed(), listed()])) assert.equal(res.status, 200);

    // End every connection to this test's database, the way a restart would.
    const admin = new pg.Client({ connectionString: PG_URL });
    await admin.connect();
    try {
      const ended = await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname LIKE 'pool_loss\\_%' AND pid <> pg_backend_pid()`,
      );
      assert.ok(ended.rowCount > 0, 'there were idle connections to end');
    } finally {
      await admin.end();
    }
    // The error arrives on a later turn of the event loop; give it room to be thrown.
    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.ok(logged.some((line) => /idle connection was lost/.test(line)), `the loss was logged: ${logged.join(' | ')}`);
    // The pool replaces what it lost: the next requests work.
    for (const res of await Promise.all([listed(), listed()])) assert.equal(res.status, 200);
  });
});
