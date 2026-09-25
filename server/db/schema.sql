CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  location    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'Pre-sale',
  theme       TEXT NOT NULL DEFAULT 'classic',
  website_url TEXT,
  builder     TEXT NOT NULL DEFAULT '',
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  tools       JSONB NOT NULL DEFAULT '{}'::jsonb,
  features    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Existing databases skip the CREATE TABLE above, so every column added since has
-- to arrive by ALTER. Keep these directly under their table and above any index
-- or constraint that names them.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}'::jsonb;
-- The column default still named 'classic', a theme retired two palettes ago.
-- Nothing reads it (both stores pass a theme explicitly) but a default that
-- names a dead theme is a trap for the next person who inserts a row by hand.
ALTER TABLE communities ALTER COLUMN theme SET DEFAULT 'navy';

CREATE TABLE IF NOT EXISTS homes (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  price        NUMERIC NOT NULL DEFAULT 0,
  beds         NUMERIC NOT NULL DEFAULT 0,
  baths        NUMERIC NOT NULL DEFAULT 0,
  sqft         NUMERIC NOT NULL DEFAULT 0,
  description  TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT 'Planning',
  lot_number   TEXT NOT NULL DEFAULT '',
  ready_on     TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE homes ADD COLUMN IF NOT EXISTS lot_number TEXT NOT NULL DEFAULT '';
-- When an unfinished home hands over keys. A literal 'YYYY-MM-DD' like slots,
-- for the same reason: a timestamp would drift a day for some viewers, and a
-- buyer gives notice on their lease around this date.
ALTER TABLE homes ADD COLUMN IF NOT EXISTS ready_on TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS homes_community_idx ON homes(community_id);

-- One walkthrough per home, held as base64 the way resource videos are.
--
-- Its own table rather than a column on homes: every query that lists homes
-- selects the whole row, so a `data` column there would drag a 25MB video out
-- of Postgres on every buyer page load. Here the bytes are only ever read by
-- the route that streams them, and home_id as the primary key is what makes it
-- one per home -- a second upload replaces the first instead of stacking up.
CREATE TABLE IF NOT EXISTS home_videos (
  home_id      TEXT PRIMARY KEY REFERENCES homes(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT '',
  data         TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS home_videos_community_idx ON home_videos(community_id);

-- Photos live in the database so a Render service with an ephemeral disk keeps them
-- across deploys. `data` holds a base64 payload for uploads; `url` an external image.
CREATE TABLE IF NOT EXISTS photos (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  home_id      TEXT REFERENCES homes(id) ON DELETE CASCADE,
  highlight_id TEXT,
  kind         TEXT NOT NULL DEFAULT 'home',
  content_type TEXT,
  data         TEXT,
  url          TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- photos predates highlights, so an existing database skips the CREATE TABLE above
-- and never gets the column from it. This ALTER must stay directly under the table
-- and ABOVE the index on that column: CREATE INDEX has no IF NOT EXISTS escape for a
-- missing column, so the wrong order takes the server down on every existing database
-- while passing on every fresh one.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS highlight_id TEXT;

CREATE INDEX IF NOT EXISTS photos_home_idx ON photos(home_id);
CREATE INDEX IF NOT EXISTS photos_community_idx ON photos(community_id, kind);
CREATE INDEX IF NOT EXISTS photos_highlight_idx ON photos(highlight_id);

-- What is around the community: schools, parks, shops, commute notes.
CREATE TABLE IF NOT EXISTS highlights (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  category     TEXT NOT NULL DEFAULT 'other',
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  detail       TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- highlights predate addresses, so an existing database needs the explicit ALTER:
-- CREATE TABLE IF NOT EXISTS above is a no-op once the table is there.
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS highlights_community_idx ON highlights(community_id, position);

-- What the builder has written and filmed: an article is a title and a
-- paragraph, a video is a title and a link. One table because they are one
-- section to the buyer, ordered together and shown together.
CREATE TABLE IF NOT EXISTS resources (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'article',
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  data         TEXT,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- An uploaded video lives on its own row rather than in photos: the bytes belong
-- to the thing that plays them, and a table called photos holding video is how
-- the next person reading this gets surprised. Resources shipped before uploads
-- existed, so these arrive by ALTER on any database that already has the table.
ALTER TABLE resources ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS data TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS size_bytes INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS resources_community_idx ON resources(community_id, position);

-- Appointment slots the builder publishes. slot_date and slot_time are literal
-- values in the community's own local time, never converted: see the note on
-- SLOT_TIMES in shared/domain.js for why.
--
-- lead_id is the booking. NULL means open; the unique index means two buyers
-- cannot be sold the same slot even if they tap at the same moment.
CREATE TABLE IF NOT EXISTS slots (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  slot_date    DATE NOT NULL,
  slot_time    TEXT NOT NULL,
  lead_id      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS slots_unique_idx ON slots(community_id, slot_date, slot_time);
CREATE INDEX IF NOT EXISTS slots_open_idx ON slots(community_id, slot_date, slot_time) WHERE lead_id IS NULL;

CREATE TABLE IF NOT EXISTS leads (
  id             TEXT PRIMARY KEY,
  community_id   TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'new',
  notes          TEXT NOT NULL DEFAULT '',
  tour           JSONB,
  saved_home_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  opened_at      TIMESTAMPTZ,
  archived_at    TIMESTAMPTZ,
  first_visit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Stamps, not flags: null means never opened / not archived. Existing databases
-- skip the CREATE TABLE above, so these have to arrive by ALTER, and they sit
-- above the index for the reason the last migration bug taught us.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Email alone no longer identifies a person: two people who share an address are
-- two leads, and only name + email + phone together mean "the same buyer" (see
-- isSameLead in shared/domain.js). So this index can no longer be unique, and
-- identity is decided by the application rather than the database.
DROP INDEX IF EXISTS leads_community_email_idx;
CREATE INDEX IF NOT EXISTS leads_community_email_lookup_idx ON leads(community_id, lower(email));

-- Proof that somebody agreed to be called and texted.
--
-- Append-only, and it stores the WORDS rather than a boolean. A row reading
-- `consented = true` proves nothing once the screen has been reworded; what a
-- TCPA claim turns on is the exact text in front of the person, the moment they
-- agreed and where they were. So each row keeps the rendered paragraph, the
-- version of the wording, the time, the IP and the user agent, and nothing ever
-- updates a row -- a change of mind is a new row.
--
-- `granted` false is a real answer, not an absence: it records that the box was
-- put in front of somebody and they left it unchecked, which is different from
-- a lead created before any of this existed and has no row at all.
CREATE TABLE IF NOT EXISTS lead_consents (
  id         TEXT PRIMARY KEY,
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  granted    BOOLEAN NOT NULL,
  consent_text TEXT NOT NULL DEFAULT '',
  version    TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_consents_lead_idx ON lead_consents(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_plan_items (
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  summary    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, key)
);

-- The buyer's own move-in plan: the date they want to be in, what is driving
-- it, the steps they ticked off and the ones they added themselves. One row per
-- lead, so it survives them coming back on a different phone -- localStorage
-- would lose the whole thing, and a plan you rebuild every visit is not yours.
CREATE TABLE IF NOT EXISTS lead_movein (
  lead_id     TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  home_id     TEXT,
  target_date TEXT NOT NULL DEFAULT '',
  lease_end   TEXT NOT NULL DEFAULT '',
  pay_method  TEXT NOT NULL DEFAULT 'loan',
  drivers     JSONB NOT NULL DEFAULT '[]'::jsonb,
  done        JSONB NOT NULL DEFAULT '[]'::jsonb,
  own_steps   JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_activity (
  id         BIGSERIAL PRIMARY KEY,
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_activity_lead_idx ON lead_activity(lead_id, created_at DESC);
