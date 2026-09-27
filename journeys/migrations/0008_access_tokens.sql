-- Personal access tokens replace the shared participant links and QR codes.
-- Organizers DM each willing participant a token; the super admin generates
-- them in the console and downloads them once as a CSV. Only the SHA-256 of
-- each token is stored. A token is not tied to a participant record: it opens
-- the app, and the person then signs up as before.
DROP TABLE IF EXISTS participant_key;

CREATE TABLE invite (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,
  batch         TEXT,          -- when the batch was generated, to tell batches apart
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_by    TEXT,
  first_used_at TEXT,
  uses          INTEGER NOT NULL DEFAULT 0,  -- how often it was entered (one person, several devices)
  revoked_at    TEXT
);
