-- Feedback on the app itself, from colleagues building it together.
CREATE TABLE feedback (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  participant_id TEXT REFERENCES participant (id),
  kind           TEXT NOT NULL CHECK (kind IN ('bug', 'idea', 'wording', 'other')),
  body           TEXT NOT NULL,
  page           TEXT,          -- where they were, e.g. "#platforms"
  viewport       TEXT,          -- e.g. "390x844", to reproduce layout bugs
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'planned', 'done', 'wontfix')),
  hidden         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX feedback_created ON feedback (hidden, created_at);

-- One +1 per person per item.
CREATE TABLE feedback_vote (
  feedback_id    INTEGER NOT NULL REFERENCES feedback (id),
  participant_id TEXT NOT NULL REFERENCES participant (id),
  PRIMARY KEY (feedback_id, participant_id)
);
