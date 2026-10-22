# Touradoor

*Turns the sign at a community entrance into the builder's lead engine.*

A mobile-first web app for individual builder communities, with two sides sharing one backend:

- **Buyer PWA** (`/c/:link`, the community's clean link or its id) — reached by scanning the QR code on a development sign.
  The first screen is the community's picture, "Welcome to <name>" and the sign-in form (name, cell number
  that is optional, and email), nothing else. It is the only way in: `/c/:link/start`, the "Sign in" buttons on the guide
  pages and a visitor who is not signed in at any other address (the public guides aside) all lead back to it. The
  headline is sized to the name (`shared/fitText.js`, measured in the browser before the first paint and again on a
  resize or when a web font loads): a short name is set larger, a long one smaller and on up to three lines, never
  wider than the screen. A name of about 60 characters or more is set at the smallest size and wraps onto more lines.
  Buyers explore homes, meet the community's realtors, read the area guide and the buyer guides,
  run seven consumer-friendly financial tools, save homes, build a progressive "My Home Plan" and
  download it as a PDF. Entry to the app is gated behind a name and email (a cell number is optional; one is
  asked for when a buyer books a time with the team); the **buyer guides are
  the one public part** (see [Buyer guides](#buyer-guides)), so they can be found and read before
  anyone hands over any details. Every page, gated or not, ends with the lender's licensing and
  disclosures.
- **Builder admin** (`/admin`) — manage communities, homes and photo galleries, write the area
  guide and edit the buyer guides, toggle which buyer tools and features are live, read leads with
  their full behavioural activity log, see stats, and configure per-community layout, theme,
  development logo, lender and compliance wording, realtors, live mortgage rates, cost
  assumptions, DPA rules and credit cutoffs.

The buyer app is **white-labeled per community** — a buyer scanning the sign at Willow Creek sees
"Willow Creek," never "Touradoor." The name is for the builder: their login, the invoice, the
sales conversation.

Every buyer action — home views, saves, tool runs, price points tested, loan types explored,
PDF downloads, tour requests — is tracked to the lead record and visible on the admin side.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, React Router, one bundle serving both route trees |
| Backend | Node 22+ / Express, REST API |
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
both, on Node 22 and 24.

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
| `PUBLIC_ORIGIN` | The one public address of the site with the `https://`, e.g. `https://touradoor.com`. **Set this in production.** It is the origin written into each page's canonical link, Open Graph tags and structured data, and into the links in emails; unset, the request's own `Host` decides, so a site that answers on two names (Render's and your domain) would publish two canonicals. A value without `https://` is ignored, and the server says so at boot. |
| `REDIRECT_TO_PUBLIC_ORIGIN` | `off` stops the site sending a visit to its Render address (`*.onrender.com`) on to `PUBLIC_ORIGIN`. It is listed in `render.yaml` as `on`; if the custom domain ever has to be taken offline, change it to `off` in the Render dashboard (Environment). The service restarts and the Render address works again within a minute or two. The admin pages (`/admin`) and the API are never redirected, so the owner always has a way in, and nor is Setup's theme preview (`/c/<id>/preview`), which the admin frames from its own address. It assumes the domain forwards the Render host name as it received it; a proxy in front (Cloudflare, a Worker) that rewrites `Host` to the `*.onrender.com` name would send every visit round in a loop, so set it to `off` there. Buyers signed in at the Render address have to sign in again at the domain (and an app added to the home screen from the old address has to be added again): a browser keeps a visitor's saved details per address. |
| `PORT` | Defaults to 3000; Render sets this. |
| `REPORT_TIME_ZONE` | The time zone whose days the lead report counts in (an IANA name, e.g. `America/Denver`). Unset or not a real zone, it is Mountain Time. |
| `RATE_LIMITS` | `off` turns the request limits off, `on` forces them on. Unset they are on, except under `node --test`. |
| `DATA_FILE` | Where the JSON-file store keeps its data when `DATABASE_URL` is unset (default `data/db.json`). |
| `RESEND_ENDPOINT` | Overrides the Resend API address; only tests and local mail catchers need it. |
| `MALLOC_ARENA_MAX` / `MALLOC_MMAP_THRESHOLD_` | Set to `2` and `131072` on Render (both are in `render.yaml`). Photos are resized on worker threads, and with glibc's defaults memory fragments: measured, asking for every photo at every width took the server to 890 MB, against 275 MB with these two set, on a plan with 512 MB. |
| `PHOTO_CACHE_MB` | How many megabytes of resized photo copies the server keeps in memory (default 48). See [Photos](#photos). |
| `RENDER_GIT_COMMIT` | Set by Render on every build. `/api/health` reports it as `commit`, so you can check that a merge is the code that is live. |

At boot the server logs a `WARNING:` line for each of these that is missing and quietly costs something: `PUBLIC_ORIGIN`,
`SESSION_SECRET`, `DATABASE_URL` and `MALLOC_ARENA_MAX` in production, and `RESEND_API_KEY` / `EMAIL_FROM` for email. Check the Render log after a deploy.

Caching: the hashed files under `/assets` are cached for an hour. The artwork under `/brand` (logos, the
Equal Housing mark) and `/guides` (artwork no longer shown on the guides) keeps its file name when it changes, so the server marks
it `Cache-Control: no-cache`: a browser keeps a copy but asks first, and an unchanged file answers `304` with no body.

**Safeguards on the public side.** A buyer is only ever sent their own record (their details, plan, saved homes and booked
time), never the builder's notes, status, activity feed or the consent evidence (`publicLead` in `server/routes/public.js`).
The sign-up form caps what it stores (name 120, email 254, phone 40 characters; a plan note 500) and refuses control
characters; every body a stranger can send (the buyer app and the sign-in form) is limited to 64 KB, and nothing under
`/api/admin` is read until the caller has signed in. Requests are counted in memory per visitor (an address; an IPv6 block counts as
one) and, where there is one, per person (`server/lib/limits.js`). Admin sign-in: 8 wrong passwords per address and email per 15 minutes, 30 per address, 60
per email from anywhere (a right password gives its own count back, and guesses sent all at once are held before the
account is looked up). Buyers: 400 sign-up attempts an hour per address and 8 per address and email; 5 plan emails a day
per buyer and 5 a day to any one inbox (`name+anything@` counts as `name@`), 2 a day to any one inbox for a copy sent to a second address,
and 30 an hour per address, counted once per message sent (a send that fails does not count); "Find out if you qualify" messages: one
every 20 seconds, 3 an hour per buyer, 20 an hour per address and 300 an hour per community; 12 booking attempts an
hour per buyer; 300 activity taps per buyer per 10 minutes; 3000 writes per address per 10 minutes. These are set for a
sales trailer on one wifi address with many buyers on it, and they are guesses about real traffic, not measurements: if
a buyer reports "Too many requests", look for the number here first. A restart clears the counts. The links written
into emails come from `PUBLIC_ORIGIN` or the plain `Host` header, never from a header the caller chose; the address a page
writes for itself in its own head still follows the proxy's forwarded headers when `PUBLIC_ORIGIN` is unset, so set it in
production.

Uploaded videos (a home's walkthrough, a Learn video) are served from an address that ends `?v=<when the file was stored>`.
The file at its *current* version is cached for a year; a replacement moves the version, so it arrives under a new address. A request
with no version, or an old one, still gets the file as it is now but is `no-cache`. Uploads are capped at 25 MB (about 12 to 25
seconds of phone video) and travel as base64 inside JSON, so only the admin routes that take one accept a body bigger than 6 MB,
and only after sign-in; for anything longer, paste a YouTube or Vimeo link (a home's own link field is on the Homes tab; the Learn tab takes the community's videos).

## Deploying to Render

1. Push this repo to GitHub.
2. Render → **New → Blueprint**, select the repo. [`render.yaml`](render.yaml) provisions the
   web service and a Postgres instance, and generates `SESSION_SECRET` and
   `RATES_WEBHOOK_SECRET`.
3. Render asks for four values the blueprint leaves blank (`sync: false`, so they never live in the repo).
   Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first deploy. `RESEND_API_KEY` and `EMAIL_FROM` can be left
   empty until the email account exists; the server logs a `WARNING:` for each at boot, and email stays off until
   both are set (put nothing in them rather than something made up). `PUBLIC_ORIGIN` is set in `render.yaml`
   (`https://touradoor.com`): links, QR codes and emails use it, and a visit to the Render address
   (`*.onrender.com`) is redirected to it. Renaming the service from `cornerpost` is done in the dashboard
   (Service → Settings → Name), after the QR codes point at the domain; renaming it in `render.yaml` would make Render create
   a second, empty service.
   `SEED_DEMO` and `NODE_VERSION` come from the file, not from the form. After the first deploy, find the log line
   `First API request: req.ip=…`: `req.ip` should be the visitor's own address. If it is the same for different people,
   the request limits would treat everyone as one visitor and `trust proxy` in `server/index.js` needs another hop count.
4. Deploy. Build runs `npm install && npm run build`; start runs `node server/index.js`, which
   serves the API, both SPAs and the per-community manifests from one service.
5. Sign in at `https://<your-domain>/admin`, create a community, add homes and photos, then use
   the QR button to print the sign. QR codes point at `https://<your-domain>/c/<link>`, where the link is the
   community's clean name (`salt-grass`) when it has one and otherwise its id (`salt-grass-zoxa`).

   **The buyer link.** A community's id is a name plus four random letters. It keys the database, the
   Zapier rate webhook and every printed sign, so it never changes. A community also has a clean **buyer link**
   (Edit community → Buyer link): new communities get one from their name (`salt-grass`, then `salt-grass-2`), and an
   existing one shows what it would be with a button to use it. The link resolves to the same community as the id and as
   every link it has had, so nothing printed or shared has to be redone; a buyer who opens the older address is shown the
   clean one in the address bar without a reload, and what they saved on the device follows them. A clean link is
   guessable from the name, and **nothing can switch an address off**: a community made from now on is reachable by its
   name from the moment it is created (its homes, prices and incentive are served to anyone who types it), the earlier
   addresses of a community keep working for good so printed signs are never orphaned, and the id itself always opens it.
   So keep a community's details private until you are ready to share them. Only a community that was made before this
   release and has not taken a clean link is reachable by its id alone. The QR dialog offers that button too, and it and
   the sign write the link with `PUBLIC_ORIGIN` when it is set, not whichever address the admin was opened on.
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
{ "conv": "7.40", "fha": "7.02", "va": "7.04" }
```

Send any subset of the three. Admins can also edit rates by hand under **Setup → Live rates**.

## Photos

Every picture a builder uploads (hero, app icon, site map, home photos, floor plans, area photos, realtor
portraits) is read in the browser and kept at up to **4096 pixels** on its long edge, never enlarged: all of a
12-megapixel phone photo, which a full-width Showcase slide on a retina screen needs. Photos are saved as WebP
at quality 0.85 (JPEG 0.90 in a browser that cannot write WebP). **Floor plans and site maps** are drawings
that buyers zoom into, so they are kept at up to 3200 px and saved **without loss** whenever that fits (the
smaller of a lossless WebP and a PNG, since a browser's lossless WebP can be five times the PNG), and at quality
0.92 when it does not. A picture too detailed for the 3 MB upload limit is tried one notch lower and then a
little smaller (never under 1920 px), so a photo straight off a camera always goes up. A realtor portrait is
kept at 800 px, the app icon at 1024 and an area photo at 2400. Logos still go up exactly as they were made.

The server then sends each screen the size it needs: `GET /api/photos/<id>?w=<width>` answers with a copy at
the next of 320, 480, 640, 960, 1280, 1600, 1920, 2560, 3200 or 4096 pixels (`shared/photoSizes.js`), made once
with sharp and kept in memory (`PHOTO_CACHE_MB`). Every picture in both apps lists those widths in a `srcset`
with a `sizes` that says how wide it is drawn, so a phone downloads a small copy and a big retina screen a big
one. A home page's hero takes its `sizes` from the layout (`heroSizes` in each layout's traits).

- A copy is **never wider than the upload**; past it, the upload itself is sent as it is. A drawing stored
  without loss is the exception: at its full size it is sent as a lossless copy made by sharp when that is
  smaller (a browser's own lossless WebP can be twenty times the size), for drawings up to 5 megapixels.
- WebP goes to a browser that says it shows WebP; anything else gets a JPEG (a PNG for a picture with
  transparency or one stored without loss). Answers carry `Vary: Accept`, the same `nosniff` and sandbox headers
  as the upload, and a year's immutable caching (a replaced picture is always a new address).
- Only the copies decode pictures. Everything before them reads the picture's header, once per photo however
  many requests arrive together, and a `HEAD` request decodes nothing. A picture with more pixels than the
  largest upload (4096 x 4096, such as a huge logo) is never decoded and is always sent as stored.
- One copy is made at a time. A request that would wait more than 8 seconds is sent the upload instead, cached
  for five minutes only, and a visitor can have at most 400 copies made in 10 minutes. A copy over 5 megapixels
  is a PNG rather than a lossless WebP, and a JPEG without mozjpeg's extra passes, because those two encoders
  hold the whole picture several times over: no copy then takes more than about 155 MB at its peak.
- `/api/photos/<id>` without `w` is unchanged, and a pasted link is still a redirect to it.
- Link previews (`og:image`) use the 1280 copy.
- The full-screen viewer opens on the copy the page already shows and sharpens as its own larger copy arrives
  (with a spinner when the page has none), and draws a picture as large as the screen allows, but never larger
  than its own pixels.

**Pictures that are too small.** The admin says, under the picture, when one is smaller than where it is used:
under 1920 px wide for the hero, a home photo or the site map, 1600 px for a floor plan (its long edge), 1200
for an area photo, 512 for the app icon, 330 for a realtor portrait and 460 / 660 / 290 for the development,
lender and brokerage logos. It says so as soon as a picture is picked, and for pictures already saved.
Nothing is refused. Pictures uploaded before this change were kept at 1280 px and will look soft on large
screens until the originals are uploaded again; the notes show which ones.

## Lot numbers, floor plans and the site map

Three things a buyer standing at a sign asks before they ask about financing:
*which lot is that, what does it look like inside, and where does it sit?*

- **Lot numbers** — a field on each home, shown beside the beds/baths line.
- **Floor plans** — up to four drawings per home, stored under their own photo kind so
  they never appear in the photo carousel and never count against the 8-photo gallery limit.
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
different person, who gets their own lead. The phone is optional: a buyer who gave none matches
only a record that has none, and a record that has a number is never opened by leaving it blank
(the cost is that someone who adds a number when booking, then signs in on another device with only
a name and email, starts a fresh record; the safer side of that trade).

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

## The admin layout

The admin opens on **Today**: the counts across every community (calls waiting, people nobody has opened yet), a card
for each community, and under the cards the calls waiting (past-their-day ones first, with a Call button for people
who agreed to calls and an Email button). It is fed by `GET /api/admin/today`, which counts closed (archived) people nowhere.

Each card wears the community's hero photo (Setup's **Hero photo (QR landing)**) across its top, so communities differ
by picture as well as by name; clicking it opens Leads, as the name does. A community with no hero photo, or one that
fails to load, gets a top of the same height in its own theme colours with its initials and a link straight to the hero
photo's slot in Setup (`/setup/look#artwork`).

Under those, **Agreed to calls, no call booked** lists everyone, in every community, who agreed to calls
and texts and gave a number but has never booked a call (`isReadyToCall` in `shared/domain.js`; somebody whose call was
handled booked one, so is not on it). Each row shows the name, the number and the community, with Call and Text buttons, and opens
the person in their community's Leads with the **Agreed, no call** filter on (`?show=ready`). The list scrolls in its
own box, starts on the people nobody has marked contacted (a switch shows everyone), and can be searched by name or
number and narrowed to one community. It lists up to 500, those not contacted first and then the most recent to
agree; the counts are of everyone, and each community's Leads has the rest.

Inside a community every section has its own address, `/admin/communities/<id>/<section>`: `leads`, `stats`,
`homes`, `area`, `learn`, `times`, `tools` and `setup`. On a computer a **side menu** lists them in three groups
(Sales, Content, Buyer app) beside a community switcher; on a phone a **bottom bar** holds Leads, Homes, Times and
Stats, and **More** opens Area, Learn, Tools, Setup, the buyer app, the QR code and flyer, Edit community,
Switch community, Today and Sign out. The Leads badge counts people who are unread or waiting for a call. Older
links of the form `/admin/communities/<id>?tab=setup` still land on the right section.

The admin has one look for every community, **Alpine Clear** (the `:root` palette at the top of
`client/src/styles/base.css`): Outfit for headings and figures, Figtree for the rest, a deep teal side menu, deep teal
for what you press, lake blue for outline buttons and links, and sky only as a highlight on the teal. Buttons are
rounded rectangles; tags, chips and badges stay pills. The buyer app keeps each community's own theme.

**Leads** is a list with the person you picked beside it (on a phone the list and the person are two pages, with a
back button). *Show* (Active, Unread, calls waiting, Agreed with no call, Closed) and *Sort* (Recent, Most ★) are separate controls, and
the **Reports** button opens the emailed report and the PDF, the PDF being made in the order chosen here. A row shows
Call and Text only for someone who agreed to calls and texts, and Email whenever the address is safe to link; a
person who did not agree shows **Do not call** beside the number, as before, and the panel for that person offers
no Call or Text either. A call is **late** when its day has passed in the report time zone (`REPORT_TIME_ZONE`), the
same day the reports and the Today page count in; the list gets that from the server (`callLate`), not from the
device's clock. Notes typed into the panel are not saved until **Save notes**; moving to another person or another
section asks first while there are unsaved notes.

**Setup** is four parts with one form behind them, each its own address: `setup/look` (layout, colours, logo, artwork),
`setup/team` (realtors, call-request alerts, the lead report address), `setup/home` (builder incentive, FAQ) and
`setup/rules` (lender and compliance, rates, costs, assistance rules, credit cutoffs). All four stay on the page and
only the one in view shows, so edits (and half-typed FAQ rows or realtor forms) are kept when you move to another, one **Save settings** saves them all, and leaving the page asks first while anything
is unsaved.

## Which tools people used

A tool counts as **used** when the buyer opens it or works in it, not only when they keep its answer. The tool screen
(and the sheet a home opens it in) says so itself, once per tool per visit, through the activity log: `Opened See My
Payment`, under the name on the tool's tile. The activity line is the record: every line is tagged with the tool it
belongs to when it is written (`lead_activity.tool`, `toolOfActivity` in `shared/domain.js`), so opening a tool, working
in it (`Explored FHA loan on payment tool`, `Compared VA`, `DPA screener: ...`, `Move-in driver: ...`) and saving what
it worked out all count. A lead carries `toolUses`, a count per tool, and `toolsUsedOf(lead)` (that, plus any saved
answer or move-in plan) is the one list the Leads tab, the person's panel, the Stats tab, the emailed report, its
spreadsheet and both PDFs read. Activity written before the tag existed is tagged when the server starts (both stores),
so what people did before still counts. A test reads the buyer app's own `track(...)` lines and fails if one stops
being recognised as its tool. The reports list the tools the community offers (`toolsOfferedBy`), plus any tool it
has since switched off that somebody used before it did, and a person's count is of the tools they used, not "of 7".
A saved move-in plan with a date is that tool's answer (`toolAnswerOf`). The call-request alert names the tools the
buyer used, and the Stats tab, like the reports, counts nobody the team has closed.

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

## The printed plan

**My Home Plan → Print / Save as PDF** prints one document: the buyer's details, the homes they like, a line for each
tool they added, and the lender footer. The **move-in plan prints in full**, not as its one-line summary: the sentence
*To have keys on Sep 20, the offer needs to be in by Aug 9*, the choices behind it (home, loan or cash, what is driving
the date, the lease end), anything the dates cannot deliver (a home still being built, a lease that overlaps or ends
early), and **every step in date order** with a tick box, the date, whose job it is (you, your lender, the builder)
and whether it is done, their own steps included, ending with a count of steps done. It is built from the plan as it
stands when the page is opened (`printableMoveIn` in `shared/moveInPrint.js`), so ticks and edits made after it was added to
the plan are in it. A buyer who added the move-in plan before choosing a date of their own prints only the saved line.

**The plan email carries the same plan** in plain text (`moveInPlanLines`): the sentence, the choices, any note, then a
line per step (`[x]` done, `[ ]` not, the date, the step, whose job it is) and the count of steps done, above the lender
footer. It is built when the buyer presses the button, so it matches the page. Without a date of their own the email
keeps the saved line. The builder's call alert still lists each tool as one line.

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

Three messages — the app is deliberately quiet.

- **A buyer asks for a call** → the builder is emailed straight away, with the phone
  number first (a buyer who signed up without one is asked for it in the booking sheet before
  anything is booked, together with the calls-and-texts question) and the buyer's saved homes and figures underneath. Reply-to is the buyer,
  so hitting reply reaches them. It goes to **Setup → Call request alerts**, falling back
  to the signed-in account so a builder who never sets it still gets told.
- **A buyer presses "Email this plan to me"** → they get their own plan and a link back
  into the app, followed by the lender's name, NMLS ID and the same disclosures printed on the
  page (built from the same function as the page footer, so the two cannot differ: the email
  carries payment estimates, so it carries the disclaimers too). Explicit only. Nothing is sent for entering the app, saving a home or
  running a tool: the gate already took their address, which is exactly why this stays a
  button.

- **The lead report**, only when the builder presses **Email the report** (on the Leads tab, and under
  **Setup → Lead report** beside the address it goes to). One address per community, saved in Setup; the button
  always sends to the *saved* address, never one named by the request, and is held while the field has an
  unsaved change. The email lists the **scheduled calls still waiting** (a booked time or a call request that
  nobody has marked handled), in one list in the order of their day, and the
  **people who signed up since the last report** (everyone, the first time), each with phone, email, second email,
  saved homes, the tools they used, what those worked out, whether they agreed to calls and texts ("Do not call · declined" or
  "never asked" beside the number when they did not, as on the Leads tab), and a link to open them. Each list is
  cut at 50 in the email ("…and 12 more, in the spreadsheet"). A **spreadsheet of everyone** is attached, so
  nothing is only in the email: it includes the team's own **notes and status** and the **phone numbers of people
  who declined calls and texts** (the column says Declined / Never asked), so it
  should be treated like the Leads tab itself. Names and notes are typed by buyers, so any spreadsheet cell that
  starts with `=`, `+`, `-` or `@` is written as plain text and cannot run as a formula (a phone number typed with a
  leading `+` therefore opens with an apostrophe: the safe trade). Days in the report ("today", the day someone
  signed up) are counted in `REPORT_TIME_ZONE` (an IANA name such as `America/Denver`, which is also the
  default), not the server's UTC clock, so an evening call is still today's.
  The time a report was **started** (`settings.reportLastSentAt`, the server's alone: a Setup save cannot
  change it, and the stamp is written as its own atomic update, never a copy of the whole settings) is what
  makes the next report say who is new. It is the start, not the finish, so anyone who signs up while the mail
  is going out is listed next time instead of never, and it is kept only when the mail provider accepted the
  send. A buyer the team closed who books a time again is reopened, so they come back to the list and to the
  next report. It is limited to one every 15 seconds and 30 a day per community. The address and the stamp are
  never served to buyers (the rate webhook's reply leaves them out too).

- **Closed people are never in a report.** Once the team closes (archives) somebody, they are left out of the
  emailed report, its spreadsheet and the leads PDF, in every community: not listed, not counted, not in the
  charts, not waiting for a call. There is no setting for it, and nothing in a request changes it. It is done in
  one place (`buildReport` in `server/lib/report.js`), which the email, the spreadsheet and the PDF all use, so they
  cannot disagree. A buyer the team closed who books a time again is reopened by the app and is back. A person's
  own report (the button on their page) can still be made for a closed person, and says they are closed.

- **PDF reports**, made only when the builder presses **Download PDF**, and saved to their own device: nothing
  is emailed and nothing is stored on the server. There are two. The **leads report** (on the Leads tab, and
  under Stats) is one page for a small community: a title band (community name, what it covers, when it was
  made), a strip of six figures (people, calls waiting, gave a phone, agreed to calls, saved
  a home, and **do not call** with how many declined or were never asked), three panels
  (the most saved homes with the calls waiting under them in the order of their day, the tools used, sign-ups
  for each of the last eight weeks) and then the list of people: name and email, phone with their answer (or a
  boxed **DO NOT CALL** tag, with a no sign, for anyone who declined or was never asked), when they signed up,
  the tools they used, saved homes, and status with their call state. The reports do not say which calls are
  past their day and carry no average plan progress. It covers everyone, or only those who signed up in the last
  7, 30 or 90 days. **The people are listed in the order chosen on the Leads tab** (its Recent / Most ★
  pills: newest first, or most saved homes first and the newest first among those who tie); the report says
  which in its subtitle, and the Stats tab, which has no such choice, gets the newest first. The tab and the
  PDF use one function (`sortLeads` in `shared/domain.js`). At most the first 2,000 people are printed and
  the page says when it cut. The **user report** (on a person's own page) is one
  person: contact, what they agreed to (the answer, when, the exact words they were shown and its version,
  and every answer on record), the call they asked for, saved homes, every tool with what it worked out when they
  kept the answer (or "Used. Nothing saved." or "Not used"), their move-in
  plan, the team's notes and everything they did in the app. Both carry a title band in the community's
  colour, the page number and a confidentiality line on every page, and count days in `REPORT_TIME_ZONE`, as
  the emailed report does. They are admin-only (a buyer's token is refused), sent `Cache-Control: no-store`
  and limited to four every ten seconds per community. The PDF is written by `server/lib/pdf.js` with no
  dependency: standard Helvetica (so no font file), text always written as hex strings so a name or note
  typed by a buyer can never be read as PDF syntax, and Windows-1252 text, so accents, curly quotes, the euro
  sign and dashes print and anything the encoding lacks (emoji, other scripts) prints as `?`.
  `server/lib/pdfReports.js` lays out the two reports; `GET /api/admin/communities/:id/reports/leads.pdf?period=all|7|30|90&sort=recent|stars`
  and `GET /api/admin/leads/:id/report.pdf` serve them.

- **The lead reports are prepared by the lender in Setup.** Both PDFs carry, under the title band, the lender's
  logo, "Prepared by" their name and NMLS ID, and their phone, email and website (and a named loan officer with
  their NMLS ID, when Setup has one); every later page has "Prepared by" the lender at the top, and every page
  has the lender and NMLS ID beside the page number at the bottom. The PDF's author is the lender. The emailed
  report opens with the same "Prepared by" line and ends with how to reach them. The logo is the one uploaded
  under **Setup → Lender logo**. Without an upload, the supplied Summit Home Loans logo is used only while the
  lender is still Summit Home Loans; for any other lender the report shows their name and no logo, so a report
  never carries another company's mark. A PNG or JPEG upload is drawn (transparent backgrounds kept; a large PNG is
  scaled down to 1,600 pixels on its longer side and an interlaced one is read too); a WebP or GIF upload gives the
  lender's name instead, never the supplied logo. A long lender name is shortened before its NMLS ID is, and a named
  loan officer is printed with their NMLS ID or not at all. With no lender name in Setup the reports
  say nothing about a lender. `server/lib/lenderBrand.js` picks the logo and words; `server/lib/pdfImage.js`
  reads a JPEG or PNG for the PDF writer with no dependency.

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

## The Setup page

Setup is a long page, so the sections that are mostly read and seldom changed are **folded** until you open
them: the **FAQ**, the **Statements printed in the footer** (inside Lender & compliance), **Live rates**,
**Monthly cost assumptions** and **Down payment assistance rules**. A folded section still shows its name, a
one-line summary of what is in it (for example *Conv 7.40% · FHA 7.02% · VA 7.04% · updated Oct 19, 2026*), an
**Unsaved changes** mark if you have edited it, and, for Live rates, the **Check rate inbox** button. Opening one
does not change anything; what you type stays on the form when you fold it, and the page's **Save settings**
button saves every section whether it is open or not. Choosing an item in *Needs your attention before launch*
opens the section it is in. Sections start folded each time the page is opened.

## Layouts

**Admin → a community → Setup → Look & feel → Layout** chooses how the buyer app is arranged. There are
eight, and the choice saves the moment it is made. (The names are what Setup shows; what is stored on a community
is a key that never changes: `cornerpost`, `saltgrass`, `foyer`, `marketplace`, `redrock`, `trailhead`,
`showcase`, `ledger`.)

- **Porch** (key `cornerpost`; what every community starts on) — one phone-width column of soft, rounded
  tiles, Manrope throughout, a *Book a tour* button in the header of every page, and **Talk about financing**
  in the menu (and on the home screen, Explore and every model's page). It has no bar at the foot of the screen.
- **Ridgeline** (key `saltgrass`) — condensed uppercase headlines, a dark header and footer with an accent rule, large
  payment figures, and a bar fixed to the foot of the screen on phones: **Book a tour**, **Talk about financing**
  (only when the community has a lender set up; it opens the day-then-time picker for the lender, or the lender's
  phone and email) and **My Home Plan**. **Book a tour** goes to the Meet the agents page. From 900px the header carries the same three buttons instead (and the
  "Preferred Lender" lockup waits for a screen about 1200px wide to make room for them). The financing button is
  left out when its sheet would have nothing on it: booking off or no times posted, and the lender has no phone or email.
- **Foyer** (key `foyer`) — a magazine-like look: Cormorant Garamond headlines, Jost text, thin rules, square corners, the
  tools as a numbered index and the guides as "From the journal". A centred title over a slim bar, with *Book a tour*,
  *Talk about financing* and *My Home Plan* as text links under it. Light ground.
- **Marketplace** (key `marketplace`) — laid out like a big home-search site, in the community's own colours, Public
  Sans throughout. A white bar with the development's mark, a text nav from 900px (Homes, Map when the site map is
  on, Financing, Learn when the guides are on), **Saved** with its count, **Book a tour** and the menu. The home
  screen leads with the homes: the builder's heading, the incentive, a filter bar (price from and to, fewest
  bedrooms, Newest / Price low to high / high to low, with how many homes are showing and a reset), then every home
  as a photo card: its status (Sold, Move-in ready, Under construction...), a heart to save it, the price large,
  an estimated monthly payment (the Payment tool's own sum at the loan and down payment the buyer last chose there,
  with the community's rates, taxes, insurance and HOA, shown only while that tool is on and labelled an
  estimate), beds, baths and floor area, and the plan name and lot (when lot numbers are on). One card across on a
  phone, two on a tablet, three from 1000px. The tools follow as "Can you buy one of these?" beside the lender
  card, then the area, the agents, the guides as article cards, the FAQ and the builder's own videos. Explore
  Homes becomes the same grid, and a home's page opens, from 900px, with its first photo large and the next four
  in a square beside it (when it has five or more), with the financing, payment and save actions in a panel that
  stays beside the details as the page scrolls. The filters only narrow what is on the screen; nothing is saved
  or reported. Light ground.
- **Red Rock** (key `redrock`) — warm and solid: Fraunces for every heading, price and payment, Figtree for the
  rest, 14px cards whose photo rounds its top-left corner more than the others, 12px buttons and pill chips. A dark
  header with the development's name (or its logo) and place, **Homes I Like** as a heart with its count, and the
  menu. The home screen opens with a big serif greeting ("Hi Dana. Could one of these be yours?"), a slim strip
  saying how many of the community's tools are in the buyer's plan ("2 of 7 steps in your plan"), the incentive,
  then a dark panel with the buyer's estimated payment set large: the Payment tool's own sum for the home they last
  picked there (or the lowest-priced home for sale) at the loan and down payment they last chose, with a line saying
  what it assumes, "An estimate, not a loan offer", and links to **Change my numbers** and **What can I afford?**. It
  is there only while the Payment tool is on and a priced home is for sale. Then up to three homes as cards (homes
  for sale first, with **See all** when there are more), each with a heart, the price large and the monthly estimate
  beside it (again only while Payment is on), and the tools as two-across tiles, followed by the lender, the area, the
  agents, the guides, the FAQ and the builder's own videos. On a phone a bar at the foot of the screen carries **Book
  a tour**, **Talk about financing** and **My Home Plan**, on the same conditions as Ridgeline's; from 900px the
  header carries them and the home widens to about 1080px with the payment beside the greeting and the homes three
  across. Tool answers sit on the same dark panel as the payment. Dark header and footer; reads best on Rust & Desert
  Plum, the theme it was drawn with.
- **Trailhead** (key `trailhead`) — the buyer's way home drawn as a trail: Bricolage Grotesque for headings, stop
  names and figures, DM Sans for the rest, 16px cards, 10px buttons and round stop markers. A slim dark header
  with a soft wave along its foot, the development's mark (or a small trail glyph and its name) and place, **Homes
  I Like** as a heart with its count, and the menu. The home screen greets the buyer ("Hi Dana.") with where they
  are on the trail ("Stop 3 of 8 on your way home") over a slim progress line, then the incentive, then one
  winding line down the screen with the community's tools as numbered stops on it, in the order the other layouts
  list them. A stop is ticked, with "In your plan" in words, once its answer is in the buyer's plan; the first
  one that is not (the current stop) opens into a card on the trail with its question and a big **Start**; the
  rest are quiet outlines, still tappable. **Pick your home** is an overlook just before My Move-In Plan (last
  when that tool is off, left out when there are no homes): the homes as a row of small photos, each with its
  price, a heart to save it and, while the Payment tool is on, a monthly estimate (the Payment tool's own sum,
  with the loan, down payment, rate and what is in the sum said under the row, and "An estimate, not a loan
  offer"); it counts as done once the buyer has saved a home. The trail ends at **Keys in hand**, and once every
  stop is done it says so and points to **My Home Plan** and **Book a tour**. The lender, the area, the agents,
  the guides, the FAQ and the builder's own videos follow, on the same conditions as Marketplace's. On a tool's
  page a strip under the header shows where it sits ("Stop 2 of 8", the stop before and the next), and the foot
  of the page offers **Next stop** and **Back to the trail**. On a phone a bar at the foot of the screen carries
  **Continue:** and the current stop's name on the home screen, with **Book a tour** beside it, and **Book a
  tour**, **Talk about financing** and **My Home Plan** elsewhere, on the same conditions as Ridgeline's; from
  900px the header carries them and the home becomes two panes, the whole trail in a narrow column that stays in
  view and the current stop opened large beside it. Turning a tool off takes its stop off the trail and the
  rest renumber. A builder's own subhead (Setup → Home screen heading) replaces "Stop 3 of 8 on your way home",
  and the count then appears beside the progress line instead. Dark header, light footer; reads best on Forest
  Green & Cream, the theme it was drawn with, or Slate Blue & Soft Green.
- **Showcase** (key `showcase`) — photo first, like phone stories: Instrument Serif (regular and italic, set very
  large) for home names, headings and big figures, Inter for everything else, pill buttons and 24px sheet corners. A
  slim dark header with the development's mark (or its name) and place, **Homes I Like** as a heart with its count,
  the menu and **Book a tour**. The home screen is dark from top to bottom, and the homes come first, as a
  carousel one home wide that fills the screen under the header: the home's first photo behind the whole slide,
  thin ticks and the builder's heading ("Hi Dana. Meet the homes at Willow Creek.") over its top, and over its
  foot its status, its name very large, the price, the estimated monthly payment with its terms in a line and "An
  estimate, not a loan offer." (the Payment tool's own sum, only while that tool is on and the home is priced and
  for sale), beds, baths and floor area, a heart to save it and **See inside**. Swipe, the arrows over the photo or
  the arrow keys move between homes; homes for sale come before sold ones, and a home with no photo shows a drawn
  house in the theme's colours. Keep the heading short: it sits over the photo, and on the smallest phones the
  line under it is left out so the photo keeps its room. With the phone on its side the photo and the words sit
  side by side. With no homes listed there is one welcome slide instead: the
  community's picture behind its name and "Homes are coming soon". Under the homes come the incentive, the tools
  with what is in the buyer's plan, the lender, the area, the agents, the guides, the FAQ and the builder's own
  videos. On a phone a pill-shaped tab bar floats at the foot of every screen: **Homes**, **My numbers**, **My
  plan** and **Learn** (when the guides are on). **My numbers** slides a sheet up over any screen: "Can you buy The
  Aspen?" for the home on screen (or the home the buyer last priced), the monthly payment set large with a bar of
  its five parts each labelled with its amount, the tools as rows, and **Talk about financing** with the lender's
  name (when the lender's sheet has something to do). From 900px the tab bar becomes a text nav in the header, the
  photo runs the width of the screen with the home's words over its lower left and a small My Home Plan panel
  over its lower right, and a film strip of every home under it jumps straight to one. The other screens are light
  with Instrument Serif titles; a tool's answer and the footer sit on the dark ground. Each home's first photo is
  what a buyer sees first, so a wide, bright exterior shot reads best. Reads best on Black, White & Orange or
  Charcoal & Bronze.
- **Ledger** (key `ledger`) — the buyer's own dashboard: IBM Plex Sans for words and headings, IBM Plex Mono for every
  figure, 12px tiles, 8px buttons and thin rules. A slim dark header says whose dashboard it is ("Dana's dashboard")
  under the development's name or logo, with **Homes I Like** as a heart with its count and the menu. The home screen
  is a bento of tiles of different sizes, figures first, each built from the buyer's own answers by the same sum the
  tool uses, so a tile always says what its tool would: **Your buying power** on the one dark tile (See What I Can
  Afford's comfortable figure, with a half-circle gauge and the cheapest homes under it marked "In budget"), **Monthly payment** (the
  Payment tool's sum for the home picked there, or the lowest-priced home for sale, as a five-part bar with its key,
  its terms and "An estimate, not a loan offer"), **Down payment** (the Savings Plan's saved-so-far against what is
  needed, as a ring), **Plan** (how many of the tools are in the plan, as dots), **Rates today** (the community's
  three rates and the date they were set), **Homes in your budget** (each home's price and monthly estimate, marked
  In budget, Worth asking or Above your range once the buyer has given an income, and a heart to save it), **Next step** (the first tool not
  yet in the plan, with Start) and **Down Payment Help** (the community's own amount and price limit). A figure the
  buyer has not given yet says so and offers the tool instead; a tool that is switched off has no tile, and payments
  appear only while the Payment tool is on. The incentive, the tools as a checklist, the lender, the area, the agents,
  the guides, the FAQ and the builder's own videos follow as tiles in the same grid, laid out so no row is left with
  a gap whichever tiles a community has. Two columns on a phone (one under 360px) and four from 768px, with a bar at
  the foot of the screen for **Book a tour**, **Talk about financing** and **My Home Plan** on Ridgeline's
  conditions; from 900px the header carries them, and from 1024px a narrow dark rail runs down the left (Dashboard,
  Homes, Tools, Learn, My Home Plan, Menu), the bar beside it turns light and the grid uses the full width. Tool answers are
  white figure tiles with the number large in the mono. Dark header, light footer; reads best on Ice Blue & Dark
  Navy, the theme it was drawn with.

Keystone, the compact figure-led layout that was the fourth choice, has been taken away. A community still storing
`keystone` is shown Marketplace (the layout nearest in spirit, not the default), to buyers and in Setup, and
nothing is rewritten in its record; Setup no longer offers it.

A layout changes the typeface, shape, spacing and where things sit. It never changes what a tool
does or what it calculates, and every screen reachable in one layout is reachable in the others.

A layout is **independent of the theme**. The twelve themes are palettes and a layout takes its colours
from whichever theme is chosen, so any layout works with any theme. One consequence to know about:
Porch is Manrope only, so a community whose theme brought its own serif face loses that
face under it. Each layout also has themes it reads best on: Ridgeline on Navy & Gold, Ice Blue & Dark Navy and Slate Blue &
Soft Green; Foyer on Charcoal & Bronze, Forest Green & Cream and Warm Modern Real Estate; Marketplace on Modern Blue &
White, Teal & Navy and Navy & Gold; Red Rock on Rust & Desert Plum; Trailhead on Forest Green & Cream and Slate Blue &
Soft Green; Showcase on Black, White & Orange and Charcoal & Bronze; Ledger on Ice Blue & Dark Navy, Modern Blue &
White and Teal & Navy. That theme, the eleventh, is rust and desert plum
on warm sand (the one theme whose cards are sand rather than white), set in Fraunces and Figtree, and it works
under any layout like the others. The twelfth, Burgundy & Blush, is the one pink and wine palette: a rose fill with
dark text on it, deep wine for the dark grounds and a blush-white page, set in Playfair Display and DM Sans.

## Colours: the try-on studio

**Admin → a community → Setup → Look & feel → Buyer app colours** picks the colours the buyer app wears. It is a
try-on studio. The twelve themes are listed on the left, each with three dots (its dark colour, its button colour
and its page) and its feel under the pointer, with a search box that finds them by name or feel (*warm*, *blue*,
*luxury*), and **Your own colours** last. The theme buyers have now is marked **In use**.

Picking a theme only **tries it on**. The preview beside the list is the community's own buyer app, in its own
layout and with its own homes and lender, drawn in a phone frame and a computer frame (**Phone**, **Computer** or
**Both**; until you pick, both when there is room to draw them at a useful size, else the phone), and it repaints
the moment a theme is tried on. Under it the studio says how easy the words are to read (*Every word is easy to
read in this theme, lowest 4.6 to 1*, measured the same way as your own colours below) and offers two buttons:
**Use** *theme* saves it, and buyers see it at once; **Keep** *current theme* goes back to what they see now.
Nothing reaches a buyer until Use is pressed, and the studio says so beside the button. When the list is not wide
enough to sit beside the preview it sits above it, in a box of its own; on a phone only the phone is shown, and
on a tablet or small laptop the switch stays, with Computer taking the whole width.

Look & feel is the one Setup part that uses the wide page on a big screen, so the preview has room; the layout
choices above it sit four across there.

The preview is a page of its own, `/c/<id>/preview`, held in a frame nothing can be clicked or tabbed into.
Setup tells the frame what to wear with a message instead of reloading it (`client/src/lib/themePreview.js`, which
both sides import), and the frame says when it is listening and is answered then, so it never shows an older look.

### Your own colours

The last row swaps the list for the colour tools (**‹ All themes** brings the list back; your colours are kept
while you try other themes):

- **Start from** a theme sets all three colours to that theme's and takes the type and shapes from it. Your own
  colours always wear one theme's fonts and corners.
- Three colours, each chosen by its button: **1 · Brand colour** (the header, the footer and dark areas),
  **2 · Button colour** (buttons, links and highlights) and **3 · Page colour** (the background).
- The chosen one is set on the **colour wheel** (hue round it, strength outward; click or drag, or focus it and
  use the arrow keys), the **Lighter or darker** slider, the **Colour code** field (`#5A1E33` or `5A1E33`; anything
  else is explained in words), or the **Goes well with** swatches (straight across the wheel, a step either side,
  lighter, darker). Every one sets the same colour, so the wheel is never the only way.

They start as the community's saved colours if it has some, otherwise as its current theme's. Colours that are
still exactly a theme's own (on opening, or straight after **Start from**) are that theme: the preview, the check
and the Use button treat them as it (**Use Burgundy & Blush**), so nothing changes until you move a colour. On a
phone the preview sits beside the wheel (*How buyers will see it*), so each move shows without scrolling.

The **Readability check** under them is worked out again with every move, by `deriveTheme` in
`shared/customTheme.js`: words on the page, on the header and footer, words in your brand colour (several layouts
write headings, phone numbers and outline buttons in it on the page), on buttons, links and labels, and the
smaller, softer text, each with its contrast ratio. Anything that would be under 4.5 to 1 is fixed for you, and the
fix is said in words: a pale button colour gets dark words on it and a darker shade for links, and buttons get a
darker edge when they would not stand out on the page; a dark page colour is lightened; a brand colour too light
for white words, or for words in it on your page, is darkened. The preview shows the fixed colours, so what you
see is what buyers get. Today names a community on its own colours *Custom colours*.

**Use these colours** saves the three colours, the start theme and the theme `custom` in one request (the server
takes `custom` only when all three colours are set). Choosing a set theme later leaves your colours saved, ready
to go back to.

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
online application (Arive). Buyers see **Start my loan process** under *Set up a time to talk* on
the home screen, under *Add to My Home Plan* in **Find My Loan Options** and in **See My Payment**, and the words
*Complete a loan application* in the loan note link to it (in a new tab, so their plan is still here). It starts
as the link Summit Home Loans supplied (`COMPLIANCE_DEFAULTS.loanApplicationUrl` in `shared/compliance.js`);
paste a different address to change it, and clear the field to hide all of those links. The loan note under *Add to My Home Plan*
reads that this is not a loan approval or offer to lend, and ends with **Rates effective:** the date the rates
above it were last updated (from Setup → Live rates), left out if rates have never been set.

## Home screen content

Under **Setup → Home screen**:

- **Home screen heading.** The heading at the top of the buyer's home screen ("Hi Dana — can you buy one of these?")
  and the line under it, in the builder's words (`settings.homeHeadline`, up to 120 characters, and
  `settings.homeSubhead`, up to 280). `{name}` is the buyer's first name ("there" when there is none) and `{community}`
  the development's name. A box left empty keeps the layout's own wording, which the field shows in grey for the
  layout the community is on (Marketplace's is "Homes at Willow Creek", Red Rock's "Hi Dana. Could one of these be
  yours?"). All eight layouts read the same two settings
  (`homeGreeting` in `shared/domain.js`), and a preview shows how it reads. It goes live with Save settings.
- **Builder incentive.** A switch and the words (headline, details, terms, button label) for an incentive card
  shown **above Explore Homes**. Nothing is filled in for you: the amount and terms are the builder's to state, and
  they are typed in Setup, so write dollar amounts in full with the dollar sign (`$20,000`).
  *Find out if you qualify* opens a sheet with **Call** and **Text** on a phone and a **message form**: the buyer's
  name and email are filled in, the message is editable, and Touradoor sends it to the incentive email (else the loan team
  email) with the buyer as the reply-to, so it works without a mail program. It needs `RESEND_API_KEY` and `EMAIL_FROM`; without
  them the buyer is told it cannot be sent from here and is shown the address (to copy or open in their mail app) and the
  number. A send that failed is noted on the lead and does not use up the buyer's limit (one message per 20 seconds, three an
  hour). The message starts as *Contact me about the preferred lender incentive for* the development (editable). The
  number is the incentive's own, or the lender's when blank. The email is the incentive's own, or
  the lender's **Loan team email** (Setup → Lender & compliance → Lender, `myloanteam@summithomeloans.com` to start)
  when blank (an address that is not a single valid one is skipped, not allowed to hide the other); with neither set, a
  computer is shown the number to call. A label saved while it was the old default
  (*Find out if I qualify*) reads as the new one.
- **FAQ.** Up to twenty questions and answers, shown on the home screen after the financing card. A new community
  starts with eight **starter questions** (what the app does, touring, My Home Plan, the payment estimate, down
  payment, applying for a loan; `DEFAULT_FAQ` in `shared/faq.js`). They name no lender, rate or amount. Edit, reorder or
  remove them under **Setup → FAQ**, and **Restore the starter questions** puts them back (it asks first, and
  nothing changes for buyers until **Save settings**). A community that has already saved its Setup page keeps what
  it saved, which can be an empty list. The exception: a saved copy of an *older starter list* that nobody edited is shown as the current one
  (the starter questions have been reworded, and `PREVIOUS_DEFAULT_FAQ_JSONS` lists the earlier ones); a list the builder changed is always kept,
  and typing an old starter list back in reads as the current one too. The section appears only when there is at least one complete question and
  answer. Answers are plain text. On a computer the question under the pointer is **highlighted** (and the one with
  keyboard focus); a phone has no hover, so a tap simply opens the answer. It is also in the page's `FAQPage`
  structured data (the home screen is behind the contact gate, so search engines do not read it).

## Realtors

**Setup → Realtors** holds up to **four realtors per community** (the server refuses a fifth). Each has a
name, brokerage, licence state and number, phone, email, website, a **photo** and a **brokerage logo**.
Realtors save on their own, not with the Save settings button.

Buyers see them **listed in full on the page**, never behind a link: on the home screen under
**Schedule your tour.** (above the buyer guides, headed *Meet the agent.*, or *Meet the agents.* when there
are several), on every home, and on a **Meet the agent** page. Each card has the licence line and
**Call**, **Text** (phones only) and **Email** buttons, and a **Tour the homes** button that opens a message to
the agent that is already written: a text on a phone, an email on a computer (whichever the agent has, if only
one). The **Explore Homes** screen has *Ready to look at homes?* under the homes, with two buttons, each shown only when it leads somewhere
(someone with a phone or an email, or times to pick for financing): **Schedule a Tour** (the realtors page; the sheet of
sales team contacts when there are no realtors) and **Find out about financing** (the lender sheet). Each model's page starts its buttons with **Talk about financing**, which opens the
same sheet for a conversation with the lender. A tour is asked for further down the model's page, under **Want a Tour?**,
through the agent cards (Call, Text and Email, not a tour button), or from **Book a tour** in the header or bottom bar, which
goes to the Meet the agents page.
Text is a link on a phone; on a computer, which cannot send a text, it copies the number and says so.

**A tour is a call or a text; the calendar is for financing.** **Book a tour** (the header, the bottom bar, the Plan
screen) takes a buyer to the **Meet the agents** page to call, text or email an agent, and books no time. With no agent
who can be reached (realtors off, or none with a phone or email) it opens a sheet of the sales team's phone and email
(from the Times tab) with the message already written; with neither, the button is left out. Only **Talk about
financing** is scheduled. Tapping **Book a tour**, and Call, Text or Email on an agent's card, is recorded in the lead's
activity. A time booked for a tour before this change stays on the buyer's Plan screen as "Your tour" (and the Stats card
*Booked calls* counts every booked time, financing included).

**Financing times on and off.** The Times tab has a switch (*Buyers can book these times to talk about financing*, on
unless switched off). On, **Talk about financing** opens a day-then-time picker, and a buyer can still choose *Or call,
text or email instead*. Off, or with no times published, it opens a sheet with the lender's phone and email (the lender's
Setup details), each message already written. Off also means the server serves no times and refuses a booking (even from
a sheet that was already open); the published times and any booking already made are kept. A buyer holds one booked
time, so a financing time they book replaces an earlier one (a tour booked before this change is replaced too). Booking can also ask for **another email** (a spouse or co-buyer): it is kept on the
lead, the builder's alert and the lead page show it, and the plan is emailed to it too on the plan screen.

**A model's page** opens with its hero photo (the first photo; the Homes tab has *Hero*, make-hero and move arrows), the
other photos as tiles under the floor plans, and, when there is one, **Watch the video tour**: an uploaded file or a
YouTube/Vimeo link, never both. Nothing opens a new tab. There is no realtor disclaimer line: the old note and fair housing line were removed. The *Realtors*
switch under **Tools → What buyers see** hides the realtors. Contact details are published as given: a website
must be an `http(s)` address and an email must contain an `@`.

## Buyer guides

Thirteen long-form guides on buying a new-construction home in Utah ship with the app (the
markdown in `server/content/guides`, kept word for word). They are the **only public part of the buyer
app**: `/c/:id/guides` and `/c/:id/guides/:slug` open without the contact gate, so a search engine or
a shared link can reach them; the header on those pages offers **Sign in** instead of the tools menu.

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
Porch layout (`cornerpost`), and copies the thirteen guides into each community that has not had them (it then
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
shared/moveInPrint.js the whole move-in plan as the printed page and the plan email show it
shared/markdown.js   the guides' markdown parser (no raw HTML, safe links only)
shared/schema.js     schema.org JSON-LD and page meta, used by the server and the browser
shared/photoSizes.js the widths a photo is served at, and the srcset that lists them
server/
  index.js           Express app, static hosting, SPA fallback, PWA manifests, security headers
  db/                Postgres store, JSON-file store, schema, demo seed
  lib/               password hashing, session tokens, id generation, the supplied guides (guides.js),
                     server-rendered page heads (ssr.js), right-sized photo copies (photoSizes.js)
  content/guides/    the thirteen supplied buyer guides, as markdown
  routes/            buyer API, admin API, rate webhook
  test/              node --test suites, run against both stores
client/src/
  buyer/             the buyer PWA: chrome, screens, the area guide, guides, realtors, the compliance
                     footer and the seven tools
  buyer/layouts/     Porch, Ridgeline, Foyer, Marketplace, Red Rock, Trailhead, Showcase and Ledger: header and home screen
                     per layout
  styles/layouts/    one stylesheet per layout, every rule scoped to .b-app.l-<layout>
  admin/             the admin app: the Today page and, per community, 8 sections (Leads, Stats, Homes, Area,
                     Learn, Times, Tools, Setup), lead detail, QR + flyer. Tools carries both the buyer-tool and
                     display-feature switches
  admin/shell/       the frame: side menu, phone top and bottom bars, the section list (sections.js)
  admin/setup/       the Setup cards: layout, development logo, lender & compliance, realtors, builder incentive, FAQ
  admin/learn/       the buyer-guide list and editor
  lib/               API client, formatting, photo reading and sizing, storage
```

## The numbers

All estimates, and labelled as such in the buyer UI.

- **Monthly P&I** — 30-year amortisation: `L·r / (1 − (1+r)^−360)`, `r = rate/1200`.
- **Payment** — P&I + property tax (`price × taxPctYr/100/12`) + insurance (`insuranceYr/12`)
  + mortgage insurance (FHA on HUD's schedule: `loan × 0.0055/12` under 5% down, `0.005/12` from 5%, 0.75% / 0.70% on a loan
    over $726,200; conventional under 20% down `loan × 0.005/12`;
  VA and 20%-down conventional none) + HOA. Cash to close = down + `price × 2.5%`, minus down
  payment assistance when the screener said "likely" and the buyer applies it.
- **Affordability** — a range, not a single number: the comfortable end at 36% DTI and the
  lender-maximum end at 43% (a common lender benchmark; there has been no federal QM DTI cap since 2021), 82% of either toward housing,
  conventional rate adjusted by credit range (excellent −0.15, fair +0.35). Enter a down payment
  and it is used as cash toward the price; leave it blank and the tool assumes 5% down.
- **DPA screening and credit ranges** — driven entirely by the admin's Setup values.

Defaults: Conv 7.40 / FHA 7.02 / VA 7.04 (the Mortgage News Daily index at the close on Oct 19, 2026, dated so);
tax 0.55%/yr; insurance $1,400/yr; HOA $45/mo; down payment help: the Utah First-Time Homebuyer Assistance Program
(new construction), $20,000 up to a $450,000 price, income limit $162,500 (the Utah Housing FHA/VA first mortgage's,
the widest the program pairs with), min credit 660, checked Oct 20, 2026; credit cutoffs 740 / 700 / 660.

**Bringing live communities up to date.** Every community keeps its own copy of the settings and of the supplied
guides from the day it was created, so changing a default reaches no community that already exists.
`server/db/refresh.js` carries a refresh into all of them once: on the first start of a server that has a new
`FIGURES_REFRESH.version`, each community not yet at that version is claimed (so two servers starting together do it
once), given the refreshed settings (the rates and their date, and the down payment program, from the current
defaults; plus any figures researched for that community by id, such as its property tax, insurance and HOA dues),
has its supplied guides' summary and body rewritten from the files (a guide the builder deleted is not brought back,
a hidden one stays hidden and in its place, and its title, byline, category, note and picture stay as the builder left
them), and is stamped with the version. Versions are dates and only ever move forward, so an older build started
after a newer refresh does not take a community back. Rates a community was sent after the refresh was written (by
the lender's webhook or in Setup) are newer than the refresh's and are kept. After that the refresh never runs again for
it, so whatever the builder then changes in Setup or the Learn tab stays. A community created later starts on the
new defaults and is stamped at creation. The Oct 20, 2026 refresh set every community to the Oct 19 rates and the
Utah First-Time Homebuyer Assistance Program, gave Willow Creek, Salt Grass TownHomes and Old Mill Village their own
2026 tax rates (and the two townhome communities their HO-6 insurance and HOA dues), and re-dated the guides.
