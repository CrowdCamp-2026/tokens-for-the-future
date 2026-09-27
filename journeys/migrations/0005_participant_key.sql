-- The participant link's key (see functions/_middleware.js). There is one row:
-- a super admin resets it from the console, which replaces the row. The key is
-- kept in clear so the console can show the link and QR code again; it is a
-- shared link posted in the conference Slack, not a personal secret.
CREATE TABLE participant_key (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_by TEXT
);
