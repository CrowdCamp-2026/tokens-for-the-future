-- Feedback on the app itself, from the admins building it together.
-- Authors and voters are admin emails (from ADMIN_TOKENS), not participants.
CREATE TABLE feedback (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  author_email TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('bug', 'idea', 'wording', 'other')),
  body         TEXT NOT NULL,
  page         TEXT,          -- where they were, e.g. "#platforms"
  viewport     TEXT,          -- e.g. "390x844", to reproduce layout bugs
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'planned', 'done', 'wontfix')),
  hidden       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX feedback_created ON feedback (hidden, created_at);

-- One +1 per admin per item.
CREATE TABLE feedback_vote (
  feedback_id INTEGER NOT NULL REFERENCES feedback (id),
  voter       TEXT NOT NULL,
  PRIMARY KEY (feedback_id, voter)
);
