import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFileStore } from './file.js';
import { createPostgresStore } from './pg.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let store = null;

/** Postgres when DATABASE_URL is set, otherwise a JSON file under ./data. */
export async function getStore() {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  store = url
    ? createPostgresStore(url)
    : createFileStore(process.env.DATA_FILE || join(root, 'data', 'db.json'));
  await store.init();
  return store;
}

export async function resetStoreForTests(newStore) {
  store = newStore;
  if (store) await store.init();
  return store;
}
