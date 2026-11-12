import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  is_registered INTEGER NOT NULL DEFAULT 0 CHECK (is_registered IN (0, 1)),
  registered_at TEXT NULL,
  last_active_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_participants_name ON participants(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_normalized ON participants(normalized_name);

CREATE TABLE IF NOT EXISTS authenticators (
  id TEXT PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NULL,
  device_type TEXT NULL,
  backed_up INTEGER NOT NULL DEFAULT 0 CHECK (backed_up IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_authenticators_participant ON authenticators(participant_id);

CREATE TABLE IF NOT EXISTS draw_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_drawn INTEGER NOT NULL DEFAULT 0 CHECK (is_drawn IN (0, 1)),
  drawn_at TEXT NULL,
  drawn_by_admin TEXT NULL,
  verification_hash TEXT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giver_id INTEGER NOT NULL UNIQUE REFERENCES participants(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL UNIQUE REFERENCES participants(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (giver_id != receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_giver ON assignments(giver_id);
CREATE INDEX IF NOT EXISTS idx_assignments_receiver ON assignments(receiver_id);

CREATE TABLE IF NOT EXISTS teaser_sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL UNIQUE REFERENCES participants(id) ON DELETE CASCADE,
  sentence TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_teasers_participant ON teaser_sentences(participant_id);

CREATE TABLE IF NOT EXISTS wish_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL UNIQUE REFERENCES participants(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  pending_push_due_at TEXT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wish_lists_participant ON wish_lists(participant_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  party_reminder_sent_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_subs_participant ON push_subscriptions(participant_id);

CREATE TABLE IF NOT EXISTS app_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  participant_id INTEGER NULL REFERENCES participants(id) ON DELETE CASCADE,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_participant ON sessions(participant_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  participant_id INTEGER NULL REFERENCES participants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_challenges_expires ON webauthn_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_challenges_participant ON webauthn_challenges(participant_id);
`;

export function initializeSchema(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL);
  runMigrations(db);
}

/** Lightweight additive migrations for databases created with an older schema version. */
function runMigrations(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(participants)').all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'last_active_at')) {
    db.exec('ALTER TABLE participants ADD COLUMN last_active_at TEXT NULL;');
  }
  const wishCols = db.prepare('PRAGMA table_info(wish_lists)').all() as Array<{ name: string }>;
  if (!wishCols.some((c) => c.name === 'pending_push_due_at')) {
    db.exec('ALTER TABLE wish_lists ADD COLUMN pending_push_due_at TEXT NULL;');
  }
}
