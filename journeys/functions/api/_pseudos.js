// Pseudonyms for HCOMP + CI 2026 attendees: 20 adjectives × 15 nouns = 300,
// all drawn from human computation and collective intelligence.
// Other attendees only ever see these; real names stay with the organizers.
export const ADJECTIVES = [
  "Calibrated", "Crowdsourced", "Emergent", "Gold-Standard", "Redundant",
  "Aggregated", "Distributed", "Bayesian", "Peer-Reviewed", "Stigmergic",
  "Deliberative", "Complementary", "Majority-Vote", "Wise", "Annotated",
  "Swarming", "Decentralized", "Interrater", "Human-in-the-Loop", "Asynchronous",
];

export const NOUNS = [
  "Starling", "Oracle", "Turker", "Ant", "Bee",
  "Annotator", "Juror", "Quorum", "Polymath", "Hive",
  "Labeler", "Delphi", "Termite", "Octopus", "Flock",
];

export const PSEUDOS = ADJECTIVES.flatMap(a => NOUNS.map(n => `${a} ${n}`));

// Two pseudonyms that differ only in case, spacing or punctuation ("Wise Ant",
// "wise-ant") count as the same name, so nobody can pass as someone else.
export const pseudoKey = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

async function takenKeys(db, exceptId = null) {
  const { results } = await db.prepare("SELECT id, pseudo FROM participant WHERE pseudo IS NOT NULL").all();
  return new Set(results.filter(r => r.id !== exceptId).map(r => pseudoKey(r.pseudo)));
}

// A free pseudonym, chosen at random. Once all 300 are taken, a number is added.
export async function freshPseudo(db) {
  const taken = await takenKeys(db);
  const free = PSEUDOS.filter(p => !taken.has(pseudoKey(p)));
  if (free.length) return free[crypto.getRandomValues(new Uint32Array(1))[0] % free.length];
  for (let i = 0; i < 50; i++) {
    const base = PSEUDOS[crypto.getRandomValues(new Uint32Array(1))[0] % PSEUDOS.length];
    const candidate = `${base} ${2 + (crypto.getRandomValues(new Uint32Array(1))[0] % 998)}`;
    if (!taken.has(pseudoKey(candidate))) return candidate;
  }
  return `Collective Mind ${crypto.randomUUID().slice(0, 6)}`;
}

// A pseudonym someone typed, checked for a participant `me`:
// { pseudo } when it is theirs to take, or { pseudo, error } when it is not.
// Their own current pseudonym counts as free, so they can change its case.
const SHAPE = /^[\p{L}\p{N}][\p{L}\p{N} .'’-]*$/u;
const RESERVED = /anonymous|admin|organi[sz]er|moderator|crowdcamp|official|hcomp/;
export async function checkPseudo(db, raw, me) {
  const pseudo = String(raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  const key = pseudoKey(pseudo);
  if (pseudo.length > 40) return { pseudo, error: "Keep it under 40 characters." };
  if (key.length < 3 || !/\p{L}/u.test(pseudo)) return { pseudo, error: "Use at least three letters or digits." };
  if (!SHAPE.test(pseudo)) return { pseudo, error: "Use letters, digits, spaces, hyphens and apostrophes only." };
  if (RESERVED.test(key)) return { pseudo, error: "That name is kept for the organizing team. Pick another." };
  if (me.name && key === pseudoKey(me.name)) return { pseudo, error: "That is your real name. Other attendees only see your pseudonym, so pick something else." };
  if ((await takenKeys(db, me.id)).has(key)) return { pseudo, error: "Someone already goes by that name. Pick another." };
  return { pseudo };
}
