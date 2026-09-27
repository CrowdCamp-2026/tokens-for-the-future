-- The timing slider gains two answers past five years, so the question stops
-- assuming the future arrives soon:
--   61  = "more than 5 years"
--   999 = "never"
-- Both sort after 60, so the values stay in order for medians and charts.
-- SQLite cannot change a CHECK constraint in place, so the table is rebuilt.
PRAGMA defer_foreign_keys = true;

CREATE TABLE notes_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  item_id    INTEGER NOT NULL,
  topic      TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('comment', 'question', 'criticism')),
  relation   TEXT NOT NULL CHECK (relation IN ('happened', 'ai_changed', 'still_open', 'unrelated')),
  horizon_months INTEGER CHECK (horizon_months IN (0, 6, 12, 18, 24, 36, 48, 60, 61, 999)),
  horizon_note   TEXT,
  body       TEXT NOT NULL,
  author     TEXT,
  device_hash TEXT,
  net_hash   TEXT,
  hidden     INTEGER NOT NULL DEFAULT 0,
  participant_id TEXT REFERENCES participant (id),
  show_name  INTEGER NOT NULL DEFAULT 0,
  point      TEXT,
  why        TEXT,
  evidence   TEXT
);

INSERT INTO notes_new (id, created_at, item_id, topic, kind, relation, horizon_months, horizon_note, body, author,
                       device_hash, net_hash, hidden, participant_id, show_name, point, why, evidence)
SELECT id, created_at, item_id, topic, kind, relation, horizon_months, horizon_note, body, author,
       device_hash, net_hash, hidden, participant_id, show_name, point, why, evidence
  FROM notes;

DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

CREATE INDEX notes_topic ON notes (topic, hidden);
CREATE INDEX notes_item ON notes (item_id, hidden);
CREATE INDEX notes_device ON notes (device_hash, created_at);
CREATE INDEX notes_net ON notes (net_hash, created_at);
CREATE INDEX notes_participant ON notes (participant_id);
