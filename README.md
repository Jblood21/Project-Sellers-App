# Cornerpost

*A cornerpost is the first post set on a site — the fixed reference every other line is squared
from. This one turns the sign at a community entrance into the builder's lead engine.*

A mobile-first web app for individual builder communities, with two sides sharing one backend:

- **Buyer PWA** (`/c/:communityId`) — reached by scanning the QR code on a development sign.
  Buyers explore homes, read the area guide, run seven consumer-friendly financial tools, save
  homes, build a progressive "My Home Plan" and download it as a PDF. Entry is gated behind
  name/email/phone.
- **Builder admin** (`/admin`) — manage communities, homes and photo galleries, write the area
  guide, toggle which buyer tools are live, read leads with their full behavioural activity log,
  see stats, and configure per-community theme, live mortgage rates, cost assumptions, DPA rules
  and credit cutoffs.

The buyer app is **white-labeled per community** — a buyer scanning the sign at Willow Creek sees
"Willow Creek," never "Cornerpost." The name is for the builder: their login, the invoice, the
sales conversation.

Every buyer action — home views, saves, tool runs, price points tested, loan types explored,
PDF downloads, tour requests — is tracked to the lead record and visible on the admin side.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, React Router, one bundle serving both route trees |
| Backend | Node 20+ / Express, REST API |
| Database | Postgres (`DATABASE_URL`), with a JSON-file store for local dev |
| PDF | Client-side `window.print()` with print CSS |
| QR | `qrcode-generator`, rendered in the admin |
| PWA | Per-community `manifest.webmanifest` + service worker |

Calculation logic and domain constants live in [`shared/domain.js`](shared/domain.js) so the
server and client can never drift apart.

## Local development

```bash
npm install
npm run install:client

# Terminal 1 + 2 in one command (Express on :3000, Vite on :5173 proxying /api)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=devpassword npm run dev
```

Open http://localhost:5173/admin, sign in with those credentials, and a demo community
("Willow Creek") is seeded on first boot. Its QR link is on the community's QR button.

Without `DATABASE_URL` the server writes to `data/db.json` — no database needed to develop.
Set `DATABASE_URL` to use Postgres; the schema is created on boot.

### Production-style run

```bash
npm run build && npm start   # Express serves client/dist plus the API on :3000
```

## Environment

See [`.env.example`](.env.example).

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Omit for the local JSON store. |
| `SESSION_SECRET` | Signs admin and buyer session tokens. **Set this in production.** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstraps (or resets) the admin account on boot. |
| `RATES_WEBHOOK_SECRET` | Shared secret for the inbound rate webhook. |
| `RESEND_API_KEY` | Enables outbound email. Omit and the app sends nothing, breaking nothing. |
| `EMAIL_FROM` | Sender address, on a domain verified with Resend. |
| `SEED_DEMO` | Set to `false` to skip seeding the demo community. |
| `PORT` | Defaults to 3000; Render sets this. |

## Deploying to Render

1. Push this repo to GitHub.
2. Render → **New → Blueprint**, select the repo. [`render.yaml`](render.yaml) provisions the
   web service and a Postgres instance, and generates `SESSION_SECRET` and
   `RATES_WEBHOOK_SECRET`.
3. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the service's environment before the first deploy
   (they are marked `sync: false` so they never live in the repo).
4. Deploy. Build runs `npm install && npm run build`; start runs `node server/index.js`, which
   serves the API, both SPAs and the per-community manifests from one service.
5. Sign in at `https://<your-domain>/admin`, create a community, add homes and photos, then use
   the QR button to print the sign. QR codes point at `https://<your-domain>/c/<communityId>`.
6. Test **Add to Home Screen** on iOS Safari and Android Chrome.

To deploy without the blueprint: create a Web Service (build `npm install && npm run build`,
start `node server/index.js`), add a Postgres instance, and set the environment variables above.

### Choosing plans

`render.yaml` asks for a `starter` web service and a `basic-256mb` database. That is deliberate:
Render's free web services spin down when idle and take roughly a minute to wake, and a buyer
standing at a sign with their phone out will not wait through that. Free Postgres also expires
after 30 days.

For pure pre-launch testing where nobody is scanning a real sign, change both `plan:` values to
`free` — everything works, with those two caveats.

### Deploying on merge

Render's own auto-deploy fires on push, before CI has said anything — which is how a
crash-looping schema reached production once. `ci.yml` instead deploys only what has
already gone green:

1. Render dashboard → your service → **Settings → Deploy Hook**, copy the URL.
2. GitHub → **Settings → Secrets and variables → Actions → New repository secret**,
   named `RENDER_DEPLOY_HOOK_URL`.
3. Turn Render's own **Auto-Deploy** off, so the two do not race.

Merges to `main` now deploy once tests pass. Without the secret the step skips with a
note, so nothing breaks if you would rather deploy by hand.

### Live rates via Zapier

Point an email-parser Zap at:

```
POST https://<your-domain>/api/communities/<communityId>/rates
x-webhook-secret: <RATES_WEBHOOK_SECRET>
{ "conv": "6.45", "fha": "6.10", "va": "5.90" }
```

Send any subset of the three. Admins can also edit rates by hand under **Setup → Live rates**.

## Lot numbers, floor plans and the site map

Three things a buyer standing at a sign asks before they ask about financing:
*which lot is that, what does it look like inside, and where does it sit?*

- **Lot numbers** — a field on each home, shown beside the beds/baths line.
- **Floor plans** — up to four drawings per home, stored under their own photo kind so
  they never appear in the photo carousel and never count against the 12-photo gallery limit.
- **Site map** — the community plat, uploaded under **Setup**, with a tap-to-enlarge view and a
  list of the lots that have a home on them.

Each is switched on or off per community under **Tools → What buyers see**. A feature that is
switched off is **stripped from the buyer payload on the server**, not merely hidden in the
client, so an unpublished lot number never reaches a buyer's browser. Switching it back on
republishes it — the toggle governs publication, not storage, and the admin always sees
everything. Each also stays hidden while it has no content, so switching one on never shows an
empty space.

## Working the leads

The Leads tab separates two things that used to share one field:

- **Unread** is automatic. A lead reads Unread until an admin opens it, and the stamp is set
  once and never moved — so "unread" always means "nobody has looked at this", not "not open
  right now". Buyer activity afterwards does not make it unread again.
- **Contacted** is yours to set, and the change is pushed back to the list you came from. That
  was previously broken: the list is loaded once, and the lead screen updated only its own copy,
  so marking somebody contacted and going back showed them unchanged. The save had worked; the
  list was showing a snapshot.

**Archive** is how a lead leaves without being deleted. Archived leads drop out of every view
except **Closed**, and stop counting as waiting for a call even if their request was never marked
handled — somebody you are done with should not keep nagging the queue. Nothing is removed, and
restoring brings back the unanswered request intact. A buyer who went quiet in spring is the same
buyer who calls in autumn.

Filters are **Active** (the default), **Unread**, the call queue, and **Closed**. The last three
only appear when they would show something, because a pill that always reads zero is one more
thing to scan past.

## Booking a time

Buyers no longer pick from vague options ("this weekend", "a phone call first"). They pick a
real time the builder has published, and say how they want to be reached.

**Admin → a community → Times.** Tap the days you are around on the calendar, tick the times
you can do, and every combination is published at once — *"Tuesday, Wednesday and Thursday at
10, 2 and 4"* is six taps. Published times are the **only** times buyers are offered, so an
empty list means nobody can book. Re-publishing the same availability adds nothing rather than
duplicating it, and past dates are kept but never offered.

Buyers see those times grouped by day, choose one, and choose **a call** or **an email**. The
choice leads the alert the builder receives, because it decides what they do next.

A booked time leaves the menu immediately. Two buyers reaching for the same slot is settled in
the database rather than by a read-then-write, so exactly one wins and the other is told plainly
to pick again. Rescheduling books the new time **before** releasing the old one — the other order
would leave someone who tried to move their appointment with none at all.

**Dates and times are stored and shown as literal values** (`2026-09-20`, `14:00`), never as
timestamps. A builder publishing 2:00 PM means 2pm at the community. A timestamp would be
re-rendered in each viewer's timezone, so the dashboard, the buyer's phone and the alert email
could show three different hours for one appointment. There is a test that round-trips a slot
through Postgres under UTC−6, UTC+12 and UTC and asserts the date never moves.

## Email

Two messages, and only two — the app is deliberately quiet.

- **A buyer asks for a call** → the builder is emailed straight away, with the phone
  number first and the buyer's saved homes and figures underneath. Reply-to is the buyer,
  so hitting reply reaches them. It goes to **Setup → Call request alerts**, falling back
  to the signed-in account so a builder who never sets it still gets told.
- **A buyer presses "Email this plan to me"** → they get their own plan and a link back
  into the app. Explicit only. Nothing is sent for entering the app, saving a home or
  running a tool: the gate already took their address, which is exactly why this stays a
  button.

Set `RESEND_API_KEY` and `EMAIL_FROM` to turn it on. Without them the app sends nothing
and everything else works unchanged — a call request is still recorded and still shows in
the builder's queue. **Sending never breaks the thing that triggered it:** if the provider
is down or slow, the buyer's request is still saved, the send is logged and abandoned
after five seconds. There is a test for exactly that.

## The area guide

Buyers ask the same questions on every visit: which school, how far to a grocery store, how long
to the freeway. **Admin → a community → Area** is where a builder answers them once. Each entry
has a category (schools, parks, shopping, healthcare, getting around, or good to know), a name, an
optional distance or hours note, a description and an optional photo — one photo per place, stored
in the database like every other image.

Entries show up for buyers under **Around Here**, grouped by category and in the order the admin
created them, with a card on the buyer home screen and an entry in the menu. Both disappear when a
community has no entries, so a builder who skips this never ships an empty screen.

## Project layout

```
shared/domain.js     tokens, tool definitions, and every calculator (single source of truth)
server/
  index.js           Express app, static hosting, SPA fallback, PWA manifests
  db/                Postgres store, JSON-file store, schema, demo seed
  lib/               password hashing, session tokens, id generation
  routes/            buyer API, admin API, rate webhook
client/src/
  buyer/             the buyer PWA: chrome, screens, the area guide, the seven tools
  admin/             the admin app: communities, 6 tabs, lead detail, QR + flyer
                     (Tools carries both the buyer-tool and display-feature switches)
  lib/               API client, formatting, photo downscaling, storage
```

## The numbers

All estimates, and labelled as such in the buyer UI.

- **Monthly P&I** — 30-year amortisation: `L·r / (1 − (1+r)^−360)`, `r = rate/1200`.
- **Payment** — P&I + property tax (`price × taxPctYr/100/12`) + insurance (`insuranceYr/12`)
  + mortgage insurance (FHA `loan × 0.0055/12`; conventional under 20% down `loan × 0.005/12`;
  VA and 20%-down conventional none) + HOA. Cash to close = down + `price × 2.5%`, minus down
  payment assistance when the screener said "likely" and the buyer applies it.
- **Affordability** — a range, not a single number: the comfortable end at 36% DTI and the
  lender-maximum end at 43% (the Qualified Mortgage limit), 82% of either toward housing,
  conventional rate adjusted by credit range (excellent −0.15, fair +0.35). Enter a down payment
  and it is used as cash toward the price; leave it blank and the tool assumes 5% down.
- **DPA screening and credit ranges** — driven entirely by the admin's Setup values.

Defaults: Conv 6.45 / FHA 6.10 / VA 5.90; tax 0.55%/yr; insurance $1,400/yr; HOA $45/mo;
DPA limit $110,000, amount $15,000, min credit 660; credit cutoffs 740 / 700 / 660.
