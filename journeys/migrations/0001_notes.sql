CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  item_id    INTEGER NOT NULL,
  topic      TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('comment', 'question', 'criticism')),
  relation   TEXT NOT NULL CHECK (relation IN ('happened', 'ai_changed', 'still_open', 'unrelated')),
  horizon_months INTEGER CHECK (horizon_months IN (0, 6, 12, 18, 24, 36, 48, 60)),
  horizon_note   TEXT,
  body       TEXT NOT NULL,
  author     TEXT,
  device_hash TEXT,
  net_hash   TEXT,
  hidden     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX notes_topic ON notes (topic, hidden);
CREATE INDEX notes_item ON notes (item_id, hidden);
CREATE INDEX notes_device ON notes (device_hash, created_at);
CREATE INDEX notes_net ON notes (net_hash, created_at);
