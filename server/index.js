import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { getStore } from './db/index.js';
import { seedIfEmpty } from './db/seed.js';
import { hashPassword } from './lib/auth.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter, ratesRouter } from './routes/public.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientDist = join(root, 'client', 'dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  // Photo uploads arrive as data URLs, so the JSON body limit has to clear 3 MB.
  app.use(express.json({ limit: '6mb' }));

  // `commit` answers the question the deploy hook exists to make answerable: is
  // what is live the code that was merged? Render sets RENDER_GIT_COMMIT on every
  // build; elsewhere it is empty rather than invented, because a wrong sha here
  // would be worse than none — it is the thing you check before believing a fix
  // shipped.
  app.get('/api/health', async (_req, res) => {
    try {
      const store = await getStore();
      res.json({ ok: true, store: store.kind, commit: process.env.RENDER_GIT_COMMIT || '' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.use('/api/admin', adminRouter());
  app.use('/api', ratesRouter());
  app.use('/api', publicRouter());

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

  /** Per-community PWA manifest so "Add to Home Screen" lands back in this community. */
  app.get('/c/:communityId/manifest.webmanifest', async (req, res) => {
    const store = await getStore();
    const community = await store.getCommunity(req.params.communityId);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const icons = await store.listCommunityPhotos(community.id, 'icon');
    const start = `/c/${community.id}`;
    res.type('application/manifest+json').json({
      name: community.name,
      short_name: community.name.slice(0, 12),
      description: `Explore homes at ${community.name} and build your own home plan.`,
      start_url: start,
      scope: start,
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#1d63e0',
      icons: icons.length
        ? [{ src: icons[0].url, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
        : [{ src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }],
    });
  });

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    // Both route trees (/c/:id/... and /admin/...) are one SPA bundle.
    app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  } else {
    app.get('*', (_req, res) =>
      res
        .status(503)
        .type('text/plain')
        .send('Client bundle not built. Run `npm run build`, or `npm run dev` for the Vite dev server.'),
    );
  }

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side.' });
  });

  return app;
}

/** Creates the bootstrap admin from env on first boot; updates the password after that. */
async function ensureAdmin(store) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    if (!(await store.countAdmins())) {
      console.warn('No admin account yet — set ADMIN_EMAIL and ADMIN_PASSWORD to create one.');
    }
    return;
  }
  await store.createAdmin({ email, passwordHash: hashPassword(password) });
  console.log(`Admin account ready: ${email}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const store = await getStore();
  await ensureAdmin(store);
  if (process.env.SEED_DEMO !== 'false') {
    const seeded = await seedIfEmpty(store);
    if (seeded) console.log(`Seeded demo community: ${seeded.name} (/c/${seeded.id})`);
  }
  createApp().listen(port, () => {
    console.log(`Cornerpost listening on :${port} (${store.kind} store)`);
  });
}
