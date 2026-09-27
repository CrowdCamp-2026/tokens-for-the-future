-- Each participant gets a pseudonym at sign-up (see functions/api/_pseudos.js).
-- Other attendees see only the pseudonym on notes; names stay with the organizers.
ALTER TABLE participant ADD COLUMN pseudo TEXT;
CREATE UNIQUE INDEX participant_pseudo ON participant (pseudo);
