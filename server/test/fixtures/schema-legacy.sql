-- A snapshot of schema.sql as it stood BEFORE area highlights existed, kept as a
-- stand-in for a database that has been in production since then.
--
-- Its job is to catch migration bugs that only appear on an EXISTING database.
-- `CREATE TABLE IF NOT EXISTS` is a no-op there, so a column added to a table
-- definition never lands; only an explicit ALTER adds it, and anything referencing
-- that column (an index, a constraint) fails if it runs first. A fresh database
-- hides this completely, which is exactly how it reached production once.
--
-- Do not edit this to match new schema changes — that defeats the point. It should
-- only move forward to a newer baseline once older databases are genuinely gone.

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
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS homes_community_idx ON homes(community_id);

-- Photos live in the database so a Render service with an ephemeral disk keeps them
-- across deploys. `data` holds a base64 payload for uploads; `url` an external image.
CREATE TABLE IF NOT EXISTS photos (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  home_id      TEXT REFERENCES homes(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'home',
  content_type TEXT,
  data         TEXT,
  url          TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_home_idx ON photos(home_id);
CREATE INDEX IF NOT EXISTS photos_community_idx ON photos(community_id, kind);

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
  first_visit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_community_email_idx ON leads(community_id, lower(email));

CREATE TABLE IF NOT EXISTS lead_plan_items (
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  summary    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, key)
);

CREATE TABLE IF NOT EXISTS lead_activity (
  id         BIGSERIAL PRIMARY KEY,
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_activity_lead_idx ON lead_activity(lead_id, created_at DESC);
