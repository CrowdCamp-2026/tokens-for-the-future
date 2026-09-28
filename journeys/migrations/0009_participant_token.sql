-- The access token is the identity. Entering it signs the person in with a
-- random pseudonym; the same token on another device finds the same
-- participant. Name, affiliation and contact are no longer asked for (the
-- columns stay for older rows). Erasing a participant sets invite_id to NULL,
-- so their notes can no longer be traced back through the token list.
ALTER TABLE participant ADD COLUMN invite_id INTEGER REFERENCES invite (id);
CREATE UNIQUE INDEX participant_invite ON participant (invite_id);
