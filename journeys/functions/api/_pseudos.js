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

// A free pseudonym, chosen at random. Once all 300 are taken, a number is added.
export async function freshPseudo(db) {
  const { results } = await db.prepare("SELECT pseudo FROM participant WHERE pseudo IS NOT NULL").all();
  const taken = new Set(results.map(r => r.pseudo));
  const free = PSEUDOS.filter(p => !taken.has(p));
  if (free.length) return free[crypto.getRandomValues(new Uint32Array(1))[0] % free.length];
  for (let i = 0; i < 50; i++) {
    const base = PSEUDOS[crypto.getRandomValues(new Uint32Array(1))[0] % PSEUDOS.length];
    const candidate = `${base} ${2 + (crypto.getRandomValues(new Uint32Array(1))[0] % 998)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `Collective Mind ${crypto.randomUUID().slice(0, 6)}`;
}
