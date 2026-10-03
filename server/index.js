import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { getStore } from './db/index.js';
import { seedIfEmpty } from './db/seed.js';
import { hashPassword } from './lib/auth.js';
import { hasControlCharacter } from './lib/params.js';
import { originOfRequest, renderBuyerPage, unavailablePage } from './lib/ssr.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter, ratesRouter } from './routes/public.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultClientDist = join(root, 'client', 'dist');

/**
 * `clientDist` is where the built client lives. It is a parameter so a test can
 * serve a minimal index.html of its own; production never passes it.
 */
export function createApp({ clientDist = defaultClientDist } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // The cheap, always-safe headers on every response, static files and the SPA
  // included. Pictures an admin uploads are served from this origin, so nosniff
  // keeps a browser from treating one as anything but the image it was labelled.
  // A Content-Security-Policy is deliberately not set here: the buyer app leans
  // on inline styles and Google Fonts, and a policy that has not been exercised
  // against every screen would break pages rather than protect them.
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
  });
  // Photo uploads arrive as data URLs, so the JSON body limit has to clear 3 MB.
  // 6mb covered photos. A 25MB video arrives base64-encoded, which is a third
  // bigger again, so the ceiling has to clear 34MB for the cap in shared/domain
  // to be the thing that refuses an oversized file rather than the parser.
  app.use(express.json({ limit: '36mb' }));

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
  app.get('/c/:communityId/manifest.webmanifest', async (req, res, next) => {
    // Express 4 does not catch a rejected promise, and Node exits on an unhandled
    // one, so a store error here would end the whole process rather than one request.
    try {
      // A NUL in the address is a community that cannot exist. The page routes
      // below answer it with the plain shell; this one is JSON, so it is a 404.
      if (hasControlCharacter(req.params.communityId)) return res.status(404).json({ error: 'Community not found' });
      const store = await getStore();
      const community = await store.getCommunity(req.params.communityId);
      if (!community) return res.status(404).json({ error: 'Community not found' });
      const icons = await store.listCommunityPhotos(community.id, 'icon');
      const start = `/c/${community.id}`;
      return res.type('application/manifest+json').json({
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
    } catch (err) {
      return next(err);
    }
  });

  if (existsSync(clientDist)) {
    // The build gives everything under /assets a hashed name, so an hour (or
    // longer) is safe there. The artwork in /brand and /guides keeps its name when
    // its content changes (a new logo, a new Equal Housing mark, a new guide hero),
    // so it must be revalidated: `no-cache` still lets the browser keep a copy,
    // and the ETag and Last-Modified that static sends turn an unchanged file
    // into a 304 with no body.
    const REVALIDATED = ['brand', 'guides'];
    app.use(express.static(clientDist, {
      index: false,
      maxAge: '1h',
      setHeaders(res, file) {
        if (REVALIDATED.includes(relative(clientDist, file).split(sep)[0])) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));

    /**
     * The three public pages a search engine is meant to find get their head
     * (title, description, canonical, Open Graph, JSON-LD) written into the
     * HTML before it is sent, because a crawler that does not run the SPA would
     * otherwise see only the stock "Homebuyer App" page. Anything that is not a
     * real community or a published guide, and any failure at all, falls
     * through to the catch-all below, so the worst case is today's behaviour.
     * `no-cache` because the answer depends on the community and the host.
     */
    const indexPath = join(clientDist, 'index.html');
    const withHead = (page) => async (req, res, next) => {
      try {
        const html = await renderBuyerPage({
          indexPath,
          store: await getStore(),
          communityId: req.params.communityId,
          page,
          slug: req.params.slug,
          origin: originOfRequest(req),
        });
        if (html === null) {
          // A real community whose guide is a draft, deleted or switched off is
          // a missing page, and a crawler that does not run the app must be told
          // so; the shell still goes out so the app can say it in words.
          const gone = await unavailablePage({
            store: await getStore(), communityId: req.params.communityId, page, slug: req.params.slug,
          });
          if (gone) {
            // Sent rather than sendFile'd so a conditional request cannot turn the 404 into a 304.
            return res.status(404).set('X-Robots-Tag', 'noindex').set('Cache-Control', 'no-cache')
              .type('html').send(await readFile(indexPath, 'utf8'));
          }
          return next();
        }
        res.set('Cache-Control', 'no-cache').vary('Host').vary('X-Forwarded-Host').vary('X-Forwarded-Proto');
        return res.type('html').send(html);
      } catch (err) {
        console.error(err);
        return next();
      }
    };
    app.get('/c/:communityId', withHead('landing'));
    app.get('/c/:communityId/guides', withHead('guides'));
    app.get('/c/:communityId/guides/:slug', withHead('guide'));

    // Both route trees (/c/:id/... and /admin/...) are one SPA bundle.
    app.get('*', (_req, res) => res.sendFile(indexPath));
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
    // A malformed body, an oversize one or a broken %-escape is the caller's
    // mistake and says so with its own status; answering 500 for those would
    // page whoever watches the logs for something we cannot fix. Only a real
    // server fault is logged with its stack.
    const status = Number(err?.status ?? err?.statusCode);
    if (status >= 400 && status < 500) {
      const error = status === 413
        ? 'That upload is too large.'
        : 'That request could not be read.';
      return res.status(status).json({ error });
    }
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong on our side.' });
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
