// GET /api/dev/seed
// Local development only: adds three demo people with notes and feedback, so the
// topic pages and the console have something to show. Safe to run twice.
import { devBypass } from "../_lib.js";

const PEOPLE = [
  ["demo1@localhost.test", "Ada Lovelace (demo)", "University of Geneva"],
  ["demo2@localhost.test", "Grace Hopper (demo)", "Virginia Tech"],
  ["demo3@localhost.test", "Alan Turing (demo)", "Independent"],
];
// [person, item_id, topic, kind, relation, horizon_months, point, why, evidence]
const NOTES = [
  [0, 269094, "platforms", "question", "ai_changed", 12, "If MTurk closes, who pays people to check AI output?", "The panel treated annotation as the main loss, but oversight work is growing.", "Speakers said requesters moved budgets to LLM labeling."],
  [1, 269094, "platforms", "comment", "still_open", 36, "Worker-owned platforms came up again, like in 2013.", "Nobody has solved how they fund themselves.", null],
  [2, 269031, "platforms", "criticism", "still_open", 24, "Proof burden is a hidden privacy tax on workers.", "Prices don't show what you have to reveal to get paid.", "The RentAHuman listings asked for location and identity."],
  [0, 269020, "governance", "comment", "happened", 0, "Communities already decide what not to delegate, informally.", "Caregiving and teaching show it.", null],
  [1, 268992, "quality", "comment", "happened", 0, "Experts catching agent failures is the bug-bounty model again.", "Their corrections evaporate unless captured.", "The talk's audit and legal examples."],
  [2, 269046, "collab", "question", "ai_changed", 6, "Do hackathon teams still need five people?", null, null],
];
const FEEDBACK = [
  [0, "idea", "Let me filter the route by day.", "#platforms", [1, 2]],
  [1, "bug", "The Went to something else link is easy to miss on a phone.", "#quality", [0]],
  [2, "wording", "“Lives it in 2 years” reads oddly. Maybe “expects it in 2 years”?", "#governance", []],
];

export async function onRequestGet({ request, env }) {
  if (!devBypass(request, env)) return new Response("Not found.", { status: 404 });
  if (await env.DB.prepare("SELECT 1 FROM participant WHERE contact = ?1").bind(PEOPLE[0][0]).first()) {
    return new Response("Demo data is already there. Open /console?dev", { status: 200 });
  }
  const ids = PEOPLE.map(() => crypto.randomUUID());
  const at = new Date().toISOString();
  const stmts = PEOPLE.map(([contact, name, aff], i) => env.DB.prepare(
    "INSERT INTO participant (id, name, affiliation, contact, contact_kind, follow_up, country, last_seen_at) VALUES (?1, ?2, ?3, ?4, 'email', ?5, 'US', ?6)"
  ).bind(ids[i], name, aff, contact, i % 2, at));
  for (const [who, item, topic, kind, rel, h, point, why, ev] of NOTES) {
    stmts.push(env.DB.prepare(
      `INSERT INTO notes (item_id, topic, kind, relation, horizon_months, point, why, evidence, body, participant_id, show_name)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)`
    ).bind(item, topic, kind, rel, h, point, why, ev, [point, why, ev].filter(Boolean).join("\n\n"), ids[who]));
  }
  await env.DB.batch(stmts);
  for (const [who, kind, body, page, voters] of FEEDBACK) {
    const { id } = await env.DB.prepare(
      "INSERT INTO feedback (participant_id, kind, body, page, viewport) VALUES (?1, ?2, ?3, ?4, '390x844') RETURNING id"
    ).bind(ids[who], kind, body, page).first();
    for (const v of voters) await env.DB.prepare("INSERT INTO feedback_vote (feedback_id, participant_id) VALUES (?1, ?2)").bind(id, ids[v]).run();
  }
  return new Response(null, { status: 302, headers: { Location: "/console?dev" } });
}
