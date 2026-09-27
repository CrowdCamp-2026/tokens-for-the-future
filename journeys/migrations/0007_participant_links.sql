-- Several participant links (up to 5, enforced in _lib.js), each with its own
-- key and QR code: one for the Slack, one for a poster, and so on. A label says
-- where each one is posted, and opens counts how often it was used, so the
-- organizers can tell which QR code people scan.
ALTER TABLE participant_key ADD COLUMN label TEXT;
ALTER TABLE participant_key ADD COLUMN opens INTEGER NOT NULL DEFAULT 0;
UPDATE participant_key SET label = 'Link ' || id WHERE label IS NULL;
