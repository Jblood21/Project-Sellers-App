import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { getStore } from './db/index.js';
import { seedIfEmpty } from './db/seed.js';
import { hashPassword, requireAdmin } from './lib/auth.js';
import { bootWarnings } from './lib/bootcheck.js';
import { hasControlCharacter } from './lib/params.js';
import { originOfRequest, pinnedOrigin, renderBuyerPage, unavailablePage } from './lib/ssr.js';
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
  // The request limits count a visitor by req.ip, which with one trusted proxy hop is the last
  // X-Forwarded-For entry. If the host puts more than one hop in front of the app, that entry is
  // not the visitor and everyone would share one count. Say what the first live request looked
  // like, once, so the owner can check it in the log instead of finding out from a buyer.
  if (process.env.NODE_ENV === 'production') {
    let seen = false;
    app.use((req, _res, next) => {
      if (!seen && req.path.startsWith('/api/')) {
        seen = true;
        console.log(`First API request: req.ip=${req.ip} X-Forwarded-For=${req.get('x-forwarded-for') ?? '(none)'}. `
          + 'req.ip should be the visitor\'s own address; if it is the same for different people, trust proxy needs a different hop count.');
      }
      next();
    });
  }
  app.disable('x-powered-by');

  // The site has its own address (PUBLIC_ORIGIN), and Render also answers on its own, older one
  // (a *.onrender.com name). A page opened there is sent to the real address, so the address bar, a
  // shared link and a scanned QR code all end up on the domain, not the Render name. Only a visit to a
  // page: the API, uploads and scripts are left alone (a health check or the rate webhook must not be
  // redirected, and a script moved to another origin would be refused). It is a 302, not a 301, so a
  // browser does not remember it forever if the domain ever has to be switched off, and
  // REDIRECT_TO_PUBLIC_ORIGIN=off (set in the Render dashboard; the service restarts and the Render
  // address works again within a minute or two) turns it off. The admin pages are never redirected,
  // so the owner keeps a working way in to the leads and settings whatever the domain is doing.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // Routes are matched without regard to letter case, so the API exemption is too.
    if (/^\/(api(\/|$)|admin(\/|$))/i.test(req.path) || process.env.REDIRECT_TO_PUBLIC_ORIGIN === 'off') return next();
    if (!String(req.get('accept') ?? '').includes('text/html')) return next();
    const pinned = pinnedOrigin();
    const host = String(req.get('host') ?? '').toLowerCase();
    if (!pinned || !/\.onrender\.com(:\d+)?$/.test(host) || host === new URL(pinned).host.toLowerCase()) return next();
    return res.redirect(302, `${pinned}${req.originalUrl}`);
  });

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
  // Photo uploads arrive as data URLs (a 3 MB cap, 4 MB once encoded), so ordinary JSON
  // gets 6 MB. A 25 MB video arrives base64-encoded, which is a third bigger again, so the
  // routes that take one get a ceiling that clears 34 MB, for the cap in shared/domain to be
  // what refuses an oversized file rather than the parser.
  const smallJson = express.json({ limit: '6mb' });
  const videoJson = express.json({ limit: '36mb' });
  // Everything a stranger can reach (the buyer app, the sign-in form) takes small forms: a sign-up,
  // a plan item, a booking, an email and a password. 64 KB is far more than any of them needs, and it
  // is the most a stranger can make the server read and parse in one request.
  const publicJson = express.json({ limit: '64kb' });
  // The 36 MB parser is for the three admin routes that take a video as a data URL, and only
  // once the caller has proved they are an admin. Left global it was a door anyone could open:
  // an anonymous 34 MB POST to ANY endpoint (the login form, the buyer contact gate) was read
  // and parsed in full before the handler could say no, and a handful at once exhausts a 512 MB
  // instance, which restarts and drops whatever upload was in flight.
  // Express routes without regard to case or a trailing slash, so this must too, or a
  // legitimate upload to '/video/' would meet the 6 MB parser and be refused.
  const carriesVideo = (req) =>
    (req.method === 'PUT' && /^\/api\/admin\/homes\/[^/]+\/video\/*$/i.test(req.path))
    || (req.method === 'POST' && /^\/api\/admin\/communities\/[^/]+\/resources\/*$/i.test(req.path))
    || (req.method === 'PATCH' && /^\/api\/admin\/resources\/[^/]+\/*$/i.test(req.path));
  const isAdminPath = (req) => /^\/api\/admin(\/|$)/i.test(req.path);
  // The one admin request a stranger legitimately makes. It carries an email and a password.
  const isLogin = (req) => req.method === 'POST' && /^\/api\/admin\/login\/*$/i.test(req.path);
  // The 6 MB parser is for a caller who has already proved they are an admin, for the same reason as
  // the video one: the limits on the sign-in form run after the body is read, so a body read first is
  // a body anyone can make this server hold in memory, a few at a time, on a 512 MB instance.
  app.use((req, res, next) => {
    if (carriesVideo(req)) return requireAdmin(req, res, () => videoJson(req, res, next));
    if (isAdminPath(req) && !isLogin(req)) return requireAdmin(req, res, () => smallJson(req, res, next));
    return publicJson(req, res, next);
  });

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
      const community = await store.resolveCommunity(req.params.communityId);
      if (!community) return res.status(404).json({ error: 'Community not found' });
      const icons = await store.listCommunityPhotos(community.id, 'icon');
      const start = `/c/${community.urlKey}`;
      return res.type('application/manifest+json').json({
        name: community.name,
        short_name: community.name.slice(0, 12),
        description: `Explore homes at ${community.name} and build your own home plan.`,
        start_url: start,
        // Wider than the start address, so an app installed from one address of a community stays
        // inside its scope when the page moves to the other one.
        scope: '/c/',
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

    // A built file that is not there is a 404, never the app's page. After a deploy
    // renames the hashed chunks, a tab that still holds the old page asks for a file
    // that is gone; answering it with HTML (and a 200) made the browser choke on a
    // "script" that was a web page, and let the service worker cache that page under
    // the script's address.
    app.get('/assets/*', (_req, res) => res.status(404).type('text/plain').send('Not found'));

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
  for (const warning of bootWarnings()) console.warn(`WARNING: ${warning}`);
  const store = await getStore();
  await ensureAdmin(store);
  if (process.env.SEED_DEMO !== 'false') {
    const seeded = await seedIfEmpty(store);
    if (seeded) console.log(`Seeded demo community: ${seeded.name} (/c/${seeded.id})`);
  }
  const server = createApp().listen(port, () => {
    console.log(`Touradoor listening on :${port} (${store.kind} store)`);
  });
  // Node closes a request that has not finished arriving after 5 minutes (408), and an
  // idle connection after 5 seconds. A 25 MB video over a weak phone signal needs far
  // longer than the first, and the second is shorter than any proxy's idle timeout, which
  // is how a proxy ends up reusing a socket Node has just closed (a sporadic 502).
  server.requestTimeout = 15 * 60 * 1000;
  server.headersTimeout = 66 * 1000;
  server.keepAliveTimeout = 65 * 1000;
}
