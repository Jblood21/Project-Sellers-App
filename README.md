# Cornerpost

*A cornerpost is the first post set on a site — the fixed reference every other line is squared
from. This one turns the sign at a community entrance into the builder's lead engine.*

A mobile-first web app for individual builder communities, with two sides sharing one backend:

- **Buyer PWA** (`/c/:communityId`) — reached by scanning the QR code on a development sign.
  Buyers explore homes, meet the community's realtors, read the area guide and the buyer guides,
  run seven consumer-friendly financial tools, save homes, build a progressive "My Home Plan" and
  download it as a PDF. Entry to the app is gated behind name/email/phone; the **buyer guides are
  the one public part** (see [Buyer guides](#buyer-guides)), so they can be found and read before
  anyone hands over a phone number. Every page, gated or not, ends with the lender's licensing and
  disclosures.
- **Builder admin** (`/admin`) — manage communities, homes and photo galleries, write the area
  guide and edit the buyer guides, toggle which buyer tools and features are live, read leads with
  their full behavioural activity log, see stats, and configure per-community layout, theme,
  development logo, lender and compliance wording, realtors, live mortgage rates, cost
  assumptions, DPA rules and credit cutoffs.

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
Set `DATABASE_URL` to use Postgres; the schema is created on boot. On an existing database the
boot also adds the columns and tables newer features need, and gives every community that has
never had them a copy of the supplied buyer guides (once; see [Upgrading](#upgrading)).

### Tests

```bash
npm test                                                    # JSON-file store; Postgres cases are skipped
TEST_DATABASE_URL=postgres://user:pw@localhost:5432/anydb npm test   # both stores
```

`TEST_DATABASE_URL` must point at a server where the user may create and drop databases: each
suite makes its own throwaway database on it and never touches the one named in the URL. CI runs
both, on Node 20 and 22.

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
| `PUBLIC_ORIGIN` | The one public address of the site, e.g. `https://homes.example.com`. **Set this in production.** It is the origin written into each page's canonical link, Open Graph tags and structured data; unset, the request's own `Host` decides, so a site that answers on two names (Render's and your domain) would publish two canonicals. |
| `PORT` | Defaults to 3000; Render sets this. |

Caching: the hashed files under `/assets` are cached for a long time. The artwork under `/brand` (logos, the
Equal Housing mark) and `/guides` (artwork no longer shown on the guides) keeps its file name when it changes, so the server marks
it `Cache-Control: no-cache`: a browser keeps a copy but asks first, and an unchanged file answers `304` with no body.

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
3. Check **Auto-Deploy** reads *No* on the service. `render.yaml` sets `autoDeploy: false`
   so a blueprint sync does not turn it back on, but a service created before that needs
   the dashboard switched by hand once.
4. Render dashboard → **Manual Deploy → Deploy latest commit**, once, to catch the service
   up to whatever merged while the hook was missing.

Merges to `main` now deploy once tests pass. Without the secret the step skips with a
note, so nothing breaks if you would rather deploy by hand.

To check what is actually live:

```
curl https://<your-domain>/api/health
{"ok":true,"store":"postgres","commit":"8cbf655…"}
```

`commit` is the sha Render built, so it answers "did my merge reach the site?" without
going looking for the change by hand. It is empty off Render, where there is no build.

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
- **Site map** — the community plat, uploaded under **Setup**, with a list of the lots that have
  a home on them.

Both open in the same full-screen viewer, **inside the app**. They used to open with
`target="_blank"`, which on a phone with the app added to the home screen is a window with no
back button and no tabs — a buyer could not get out without killing the app. The viewer closes
four ways: the ✕, a Done button, tapping outside, and Escape.

Each is switched on or off per community under **Tools → What buyers see**, alongside the other
display features (videos and articles, buyer guides, realtors). A feature that is
switched off is **stripped from the buyer payload on the server**, not merely hidden in the
client, so an unpublished lot number never reaches a buyer's browser. Switching it back on
republishes it — the toggle governs publication, not storage, and the admin always sees
everything. Each also stays hidden while it has no content, so switching one on never shows an
empty space.

## Who counts as the same buyer

The entry gate signs a returning buyer back into their own record — their saved homes, their
plan, their history — when **name, email and phone all match**. Any one of them different is a
different person, who gets their own lead.

Matching compares the **information, not the keystrokes**. `(801) 555-0111`, `801-555-0111` and
`8015550111` are one phone number; `Sam  Rivera` is `sam rivera`. Without that a buyer who came
back and typed their number without brackets would be handed a duplicate, which is the thing
this is meant to prevent.

Two consequences worth knowing:

- **Two people can share an email address.** A couple who both scan the sign with one household
  address are two leads, as they should be. Email alone used to decide identity, which silently
  merged the second person into the first and lost a lead. That also means
  `leads(community_id, lower(email))` can no longer be UNIQUE — `schema.sql` drops it and
  replaces it with a plain lookup index, and identity is now the application's decision rather
  than the database's.
- **A different name on the same contact details is a new lead.** Somebody entering "Sam Rivera
  Jr" having previously entered "Sam Rivera" gets a second record. That is the deliberate cost of
  requiring all three: strictness that separates two real people also separates one person who
  typed their name differently. Merging duplicates by hand is not built yet.

Identity is scoped per community — the same person at two developments is two leads, because they
are two separate conversations.

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

Buyers **pick a day first** (the next six days that have times, with a *More days* button for the rest), and
only then do that day's times open. They then choose **a call** or **an email**. The choice leads the alert the
builder receives, because it decides what they do next. A buyer who has already booked sees their own time chosen.

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
  into the app, followed by the lender's name, NMLS ID and the same disclosures printed on the
  page (built from the same function as the page footer, so the two cannot differ: the email
  carries payment estimates, so it carries the disclaimers too). Explicit only. Nothing is sent for entering the app, saving a home or
  running a tool: the gate already took their address, which is exactly why this stays a
  button.

Set `RESEND_API_KEY` and `EMAIL_FROM` to turn it on. Without them the app sends nothing
and everything else works unchanged — a call request is still recorded and still shows in
the builder's queue. **Sending never breaks the thing that triggered it:** if the provider
is down or slow, the buyer's request is still saved, the send is logged and abandoned
after five seconds. There is a test for exactly that.

## The area guide (Local Spots)

Buyers ask the same questions on every visit: which school, how far to a grocery store, how long
to the freeway. **Admin → a community → Area** is where a builder answers them once. Each entry
has a category (schools, parks, shopping, healthcare, getting around, or good to know), a name, an
optional distance or hours note, a description and an optional photo — one photo per place, stored
in the database like every other image.

This is the builder's own list of nearby places, and is a different thing from the
[buyer guides](#buyer-guides) below. Entries show up for buyers under **Local Spots**, grouped by category and in the order the admin
created them, with a card on the buyer home screen and an entry in the menu. Both disappear when a
community has no entries, so a builder who skips this never ships an empty screen.

## Layouts

**Admin → a community → Setup → Look & feel → Layout** chooses how the buyer app is arranged. There are
two, and the choice saves the moment it is made:

- **Cornerpost Default** (what every community starts on) — one phone-width column of soft, rounded
  tiles, Manrope throughout, a *Talk to the Team* button in the header of every page.
- **Salt Grass** — condensed uppercase headlines, a dark header and footer with an accent rule, large
  payment figures, and a two-button bar fixed to the foot of the screen on phones.

A layout changes the typeface, shape, spacing and where things sit. It never changes what a tool
does or what it calculates, and every screen reachable in one layout is reachable in the other.

A layout is **independent of the theme**. The ten themes are palettes and a layout takes its colours
from whichever theme is chosen, so any layout works with any theme. One consequence to know about:
Cornerpost Default is Manrope only, so a community whose theme brought its own serif face loses that
face under the default layout. Salt Grass reads best on the Navy & Gold, Ice Blue & Dark Navy and Slate Blue & Soft Green themes.

## Development logo

**Setup → Look & feel → Development logo** takes the development's own mark, plus an optional
version for dark backgrounds. The layouts use the dark-background version wherever the page is dark
and fall back to the ordinary logo on a light plate when only one was uploaded. With no logo at all
the community's name is set as text. Logos are JPEG, PNG, WebP or GIF up to 3 MB; **SVG is refused**
on purpose, because an uploaded SVG can carry a script and these files are served from the app's own
origin. The server checks the file's first bytes against its declared type, not just the label.

## Lender and compliance

Every buyer page ends with a footer built from **Setup → Lender & compliance**: the lender's logo and
Equal Housing Lender mark, name, NMLS ID, address, phone, the named loan officer and their own NMLS ID,
the state licensing sentence, a link to NMLS Consumer Access, and the statements that the
information is not an offer for credit, that the lender is not a real estate agent, the equal housing
/ ECOA notice, and the estimate and rate disclaimers. The footer is on **every** buyer route (landing page and
entry gate included), on the printed plan, and, as plain text, at the end of the plan email.

Everything is editable per community and starts from Summit Home Loans' details. A **Restore Summit
defaults** button resets a group of fields, and a lender-logo override replaces the supplied Summit
logo. Statements can use `{lender}`, `{nmls}`, `{lo}`, `{loNmls}`, `{community}` and `{builder}`.
The small labels the footer prints itself (*Loan officer:*, *Verify our licensing at NMLS Consumer
Access*, *Privacy Policy*, *Terms of Use*, *Accessibility*) are fixed and not settings.

**Read this before launch.**

- The wording is **not legal advice and has not been reviewed by counsel.** Have your compliance
  team read it. Mortgage advertising is regulated, and what is required depends on the lender, the
  state and the relationship between builder and lender.
- Some things are **deliberately left blank, and are never filled in for you**, because only the
  lender or builder has them: the **privacy policy, terms of use and accessibility links**, the
  lender's website, and any **RESPA Affiliated Business Arrangement disclosure** (owed if builder
  and lender are affiliated). The state licensing sentence ships with the Utah mortgage entity
  licence number the owners supplied, and no individual loan officer is named until a community
  adds one. Setup lists what is still missing under **Needs your attention before launch**. The same list flags a required statement (equal housing, not an offer
  for credit, not a real estate agent) that has been blanked out.
- Blank the lender's name or NMLS ID and the footer drops the lender logo and Equal Housing mark
  and prints only the statements.

**Starting a loan.** Under **Setup → Lender & compliance → Lender** the **Loan application link** is the lender's
online application (Arive). With it set, buyers see **Start my loan process** under *Set up a time to talk* on
the home screen, under *Add to My Home Plan* in **Find My Loan Options** and in **See My Payment**, and the words
*Complete a loan application* in the loan note link to it (in a new tab, so their plan is still here). It is blank
until you set it, and a blank link hides all of those: nothing is guessed. The loan note under *Add to My Home Plan*
reads that this is not a loan approval or offer to lend, and ends with **Rates effective:** the date the rates
above it were last updated (from Setup → Live rates), left out if rates have never been set.

## Home screen content

Under **Setup → Home screen**:

- **Builder incentive.** A switch and the words (headline, details, terms, button label) for an incentive card
  shown **above Explore Homes**. Nothing is filled in for you: the amount and terms are the builder's to state.
  *Find out if I qualify* opens a sheet with **Call** and **Text** on a phone or **Email** on a computer, and the
  message already typed: *Contact me about the preferred lender incentive for* the development (editable). The
  number is the incentive's own, or the lender's when blank; a computer with no email set is shown the number.
- **FAQ.** Up to twenty questions and answers, shown on the home screen after the financing card. The section
  appears only when there is at least one complete question and answer. Answers are plain text. It is also
  in the page's `FAQPage` structured data (the home screen is behind the contact gate, so search engines do not read it).

## Realtors

**Setup → Realtors** holds up to **four realtors per community** (the server refuses a fifth). Each has a
name, brokerage, licence state and number, phone, email, website, a **photo** and a **brokerage logo**.
Realtors save on their own, not with the Save settings button.

Buyers see them **listed in full on the page**, never behind a link: on the home screen under
**Schedule your tour.** (above the buyer guides, headed *Meet the agent.*, or *Meet the agents.* when there
are several), on every home, and on a **Meet the agent** page. Each card has the licence line and
**Call**, **Text** (phones only) and **Email** buttons, and a **Tour the homes** button that opens a message to
the agent that is already written: a text on a phone, an email on a computer (whichever the agent has, if only
one). The **Explore Homes** screen has *Ready to look at homes?* under the homes (one button per agent a message can
reach), and each model's page starts its buttons with **Tour this model**, which opens **Talk to the team** (the
day-then-time picker), not a message to an agent (the agent cards on a model page have Call, Text and Email, not a
tour button). Nothing opens a new tab. There is no realtor disclaimer line: the old note and fair housing line were removed. The *Realtors*
switch under **Tools → What buyers see** hides the realtors. Contact details are published as given: a website
must be an `http(s)` address and an email must contain an `@`.

## Buyer guides

Thirteen long-form guides on buying a new-construction home in Utah ship with the app (the
markdown in `server/content/guides`, kept word for word). They are the **only public part of the buyer
app**: `/c/:id/guides` and `/c/:id/guides/:slug` open without the contact gate, so a search engine or
a shared link can reach them; the header on those pages offers to open the app instead of the tools menu.

Each community gets its own copy, edited under **Learn → Buyer guides**: title, category, byline,
note, summary, address (slug), a markdown body with a live preview, and a
Published switch. Guides have **no pictures**: buyers see words only. **Add a guide** writes a new one. Deleting a guide deletes it for good: the supplied
set is copied into a community **once**, so a deleted guide does not come back on restart. **Restore the
supplied guides** brings back any that are missing, matched by where they came from, and never touches
one you have edited. Markdown is rendered to elements, never to raw HTML, and a link or image
that is not `http(s)`, `mailto:`, `tel:` or a site path is shown as text.

## Structured data

Every buyer page carries schema.org **JSON-LD**: the community, the lender and the builder on the landing
page, `Article` markup on a guide, `RealEstateAgent` for realtors, homes with their offers, and
`BreadcrumbList` and `ImageObject` entries for every picture shown, which also carry real `alt` text (on the
tools home that means the community banner and the realtors' photos; guides have no pictures). The
server writes the head (title, description, canonical link, Open Graph tags and the JSON-LD) into the HTML
of the **three public pages** (landing, guide list and each guide) before it is sent, so a crawler that does not run the
app still sees it; the app then takes the tags over. A guide that is a draft, deleted or switched off
answers **404 with `noindex`**. Pages behind the contact gate are `noindex, nofollow`. Set `PUBLIC_ORIGIN`
so the canonical address is one address.

## Upgrading

Nothing needs doing by hand. On boot the server adds the new columns and tables, gives every existing community the
Cornerpost Default layout, and copies the thirteen guides into each community that has not had them (it then
records that it has, so later restarts add nothing). Afterwards, **for each community**:

1. Open **Setup → Lender & compliance** and fill in everything under *Needs your attention before launch*
   (see [above](#lender-and-compliance)), and have the wording reviewed.
2. Choose a layout and upload the development logo.
3. Add the realtors.
4. Set `PUBLIC_ORIGIN` on the service.

Sessions signed in before an upgrade stay valid. Tokens now record whether they belong to an admin or a
buyer: a buyer's token is no longer accepted by any admin route.

## Project layout

```
shared/domain.js     tokens, tool definitions, and every calculator (single source of truth)
shared/compliance.js the lender block, the disclosure wording and what is still missing (footer, email, JSON-LD)
shared/markdown.js   the guides' markdown parser (no raw HTML, safe links only)
shared/schema.js     schema.org JSON-LD and page meta, used by the server and the browser
server/
  index.js           Express app, static hosting, SPA fallback, PWA manifests, security headers
  db/                Postgres store, JSON-file store, schema, demo seed
  lib/               password hashing, session tokens, id generation, the supplied guides (guides.js),
                     server-rendered page heads (ssr.js)
  content/guides/    the thirteen supplied buyer guides, as markdown
  routes/            buyer API, admin API, rate webhook
  test/              node --test suites, run against both stores
client/src/
  buyer/             the buyer PWA: chrome, screens, the area guide, guides, realtors, the compliance
                     footer and the seven tools
  buyer/layouts/     Cornerpost Default and Salt Grass: header and home screen per layout
  styles/layouts/    one stylesheet per layout, every rule scoped to .b-app.l-<layout>
  admin/             the admin app: communities, 8 tabs (Homes, Area, Learn, Times, Tools, Leads, Stats,
                     Setup), lead detail, QR + flyer. Tools carries both the buyer-tool and
                     display-feature switches
  admin/setup/       the Setup cards: layout, development logo, lender & compliance, realtors, builder incentive, FAQ
  admin/learn/       the buyer-guide list and editor
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
