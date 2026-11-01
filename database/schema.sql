-- Deck Twin metadata for Cloudflare D1 (SQLite). Safe to run again: it only creates what is missing.

-- A company using the console. Every user belongs to one.
CREATE TABLE IF NOT EXISTS organisations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- What an account may do: user (sign-up), system_admin, super_admin.
CREATE TABLE IF NOT EXISTS account_types (
  key                TEXT PRIMARY KEY,
  label              TEXT NOT NULL,
  description        TEXT NOT NULL,
  can_switch_views   INTEGER NOT NULL DEFAULT 0 CHECK (can_switch_views IN (0, 1)),
  can_manage_users   INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_users IN (0, 1)),
  can_manage_orgs    INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_orgs IN (0, 1))
);

-- What an account sees: all, operations, finance, hse.
CREATE TABLE IF NOT EXISTS console_views (
  key          TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  description  TEXT NOT NULL,
  sort         INTEGER NOT NULL
);

-- One row per console tab. `key` matches data-page in the app.
CREATE TABLE IF NOT EXISTS console_pages (
  key    TEXT PRIMARY KEY,
  label  TEXT NOT NULL,
  title  TEXT NOT NULL,
  area   TEXT NOT NULL CHECK (area IN ('operations', 'safety', 'integrity', 'commercial', 'admin')),
  sort   INTEGER NOT NULL
);

-- Which tabs each view shows.
CREATE TABLE IF NOT EXISTS console_view_pages (
  view_key  TEXT NOT NULL REFERENCES console_views (key) ON DELETE CASCADE,
  page_key  TEXT NOT NULL REFERENCES console_pages (key) ON DELETE CASCADE,
  PRIMARY KEY (view_key, page_key)
);

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  organisation_id  TEXT NOT NULL REFERENCES organisations (id),
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name             TEXT NOT NULL,
  password_hash    TEXT,
  account_type     TEXT NOT NULL DEFAULT 'user' REFERENCES account_types (key),
  console_view     TEXT NOT NULL DEFAULT 'operations' REFERENCES console_views (key),
  status           TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  last_login_at    TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- the full view is for admins: a sign-up user always has one of the three roles
  CHECK (account_type <> 'user' OR console_view <> 'all')
);
CREATE INDEX IF NOT EXISTS users_organisation ON users (organisation_id);

-- A signed-in browser. Only a SHA-256 hash of the cookie is stored.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions (expires_at);

-- One row per call the Worker forwards to a paid model. Never holds a key, a prompt or a frame.
CREATE TABLE IF NOT EXISTS model_requests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  organisation_id  TEXT REFERENCES organisations (id),
  user_id          TEXT REFERENCES users (id) ON DELETE SET NULL,
  route            TEXT NOT NULL,
  status           INTEGER NOT NULL,
  duration_ms      INTEGER NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS model_requests_org_time ON model_requests (organisation_id, created_at);
CREATE INDEX IF NOT EXISTS model_requests_user_time ON model_requests (user_id, created_at);

-- Who changed what: accounts, roles and view access.
CREATE TABLE IF NOT EXISTS audit_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  organisation_id  TEXT REFERENCES organisations (id),
  user_id          TEXT REFERENCES users (id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  target           TEXT,
  detail           TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_log_org_time ON audit_log (organisation_id, created_at);
