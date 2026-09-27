// Pseudonyms for HCOMP + CI 2026 participants: 20 adjectives × 15 nouns = 300.
// The adjectives are ideas from human computation and collective intelligence;
// the nouns are roles people take on in collective work, crowd work included,
// since this week the participants are the crowd. No animals or insects, and
// no word that could read as mocking crowd workers ("Turker", "Redundant").
// Other participants only ever see these; real names stay with the organizers.
export const ADJECTIVES = [
  "Calibrated", "Deliberative", "Bayesian", "Emergent", "Distributed",
  "Decentralized", "Asynchronous", "Complementary", "Collective", "Participatory",
  "Federated", "Reciprocal", "Iterative", "Open-Source", "Crowd-Powered",
  "Curious", "Independent", "Wise", "Stigmergic", "Peer-Reviewed",
];

export const NOUNS = [
  "Annotator", "Rater", "Reviewer", "Juror", "Forecaster",
  "Delegate", "Curator", "Moderator", "Steward", "Scout",
  "Mentor", "Cartographer", "Weaver", "Navigator", "Archivist",
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
