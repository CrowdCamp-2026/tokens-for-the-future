-- Who is taking part: name, affiliation and a contact (email or phone).
-- The contact is the identity; it is nulled on erasure so the row can never be
-- signed back into (WHERE contact = ? never matches NULL).
CREATE TABLE participant (
  id           TEXT PRIMARY KEY,
  name         TEXT,
  affiliation  TEXT,
  contact      TEXT UNIQUE,
  contact_kind TEXT CHECK (contact_kind IN ('email', 'phone')),
  follow_up    INTEGER NOT NULL DEFAULT 0,
  net_hash     TEXT,
  country      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_seen_at TEXT,
  erased_at    TEXT
);

-- A note now belongs to a participant. show_name records whether the name and
-- affiliation were public when it was posted (PUBLIC_NAMES in notes.js).
ALTER TABLE notes ADD COLUMN participant_id TEXT REFERENCES participant (id);
ALTER TABLE notes ADD COLUMN show_name INTEGER NOT NULL DEFAULT 0;
CREATE INDEX notes_participant ON notes (participant_id);

-- The note is written in three parts, after the partitioned text fields of
-- Menon, Zhang & Perrault (CHI 2020): a point, the reason, and evidence from
-- the talk. Kept separately for analysis; body holds them joined for display.
ALTER TABLE notes ADD COLUMN point TEXT;
ALTER TABLE notes ADD COLUMN why TEXT;
ALTER TABLE notes ADD COLUMN evidence TEXT;
