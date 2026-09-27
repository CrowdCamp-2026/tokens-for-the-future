// GET  /api/notes?topic=<key>   public notes for one topic, plus a summary
// POST /api/notes               add a note to a program item (signed-in participants only)
import { json, bad, readJson, clean, requireSecret, keyedHash, clientIp, currentParticipant } from "./_lib.js";

const KINDS = ["comment", "question", "criticism"];
const RELATIONS = ["happened", "ai_changed", "still_open", "unrelated"];
const HORIZONS = [0, 6, 12, 18, 24, 36, 48, 60];  // months; 0 = "already happened"
const MAX_PART = 1500;
const MAX_HORIZON_NOTE = 300;
const RATE_WINDOW_MIN = 10;  // minutes
const PERSON_LIMIT = 8;      // notes per participant per window
const NETWORK_LIMIT = 200;   // notes per IP per window (venue Wi-Fi shares one IP)
// Show the name and affiliation given at sign-up next to each note. Set to false
// to show notes anonymously to other attendees (organisers still see who wrote them).
const PUBLIC_NAMES = true;

let program = null;  // { items: Set<id>, topics: Set<key> }, cached per isolate

async function loadProgram(env, request) {
  if (program) return program;
  const data = await (await env.ASSETS.fetch(new URL("/data.json", request.url))).json();
  program = {
    items: new Set(data.blocks.flatMap(b => b.contents.map(c => c.id))),
    topics: new Set(data.topics.map(t => t.key)),
  };
  return program;
}

async function overLimit(env, column, value, limit) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notes WHERE ${column} = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?2)`
  ).bind(value, `-${RATE_WINDOW_MIN} minutes`).first();
  return row.n >= limit;
}

// Multi-line text: keep line breaks, drop control characters.
const text = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

// Names are shown only when the writer chose so and has not erased their record.
// Contacts are never returned.
const PUBLIC_NOTE = `
  n.id, n.created_at, n.item_id, n.kind, n.relation, n.horizon_months, n.horizon_note,
  n.point, n.why, n.evidence, n.body,
  CASE WHEN n.show_name = 1 AND p.erased_at IS NULL THEN p.name END AS author,
  CASE WHEN n.show_name = 1 AND p.erased_at IS NULL THEN p.affiliation END AS affiliation`;

export async function onRequestGet({ request, env }) {
  const topic = new URL(request.url).searchParams.get("topic");
  const { topics } = await loadProgram(env, request);
  if (!topics.has(topic)) return bad("Unknown topic.");
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_NOTE} FROM notes n LEFT JOIN participant p ON p.id = n.participant_id
      WHERE n.topic = ?1 AND n.hidden = 0 ORDER BY n.created_at DESC LIMIT 1000`
  ).bind(topic).all();
  const summary = {
    notes: results.length,
    horizon: Object.fromEntries(HORIZONS.map(h => [h, 0])),
    relation: Object.fromEntries(RELATIONS.map(r => [r, 0])),
  };
  for (const n of results) {
    if (n.horizon_months !== null) summary.horizon[n.horizon_months]++;
    summary.relation[n.relation]++;
  }
  return json({ notes: results, summary });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return bad("Send the note as JSON.");
  if (body.website) return json({ ok: true }, 201);  // honeypot: quietly drop bots

  const participant = await currentParticipant(request, env);
  if (!participant) return bad("Sign in first, so we know who wrote this.", 401);

  const { items, topics } = await loadProgram(env, request);
  const note = {
    item_id: Number(body.item_id),
    topic: String(body.topic || ""),
    kind: String(body.kind || ""),
    relation: String(body.relation || ""),
    horizon_months: body.horizon_months == null || body.horizon_months === "" ? null : Number(body.horizon_months),
    horizon_note: clean(body.horizon_note, MAX_HORIZON_NOTE) || null,
    point: text(body.point, MAX_PART),
    why: text(body.why, MAX_PART) || null,
    evidence: text(body.evidence, MAX_PART) || null,
    show_name: PUBLIC_NAMES ? 1 : 0,
  };
  if (!items.has(note.item_id)) return bad("That talk is not in the program.");
  if (!topics.has(note.topic)) return bad("Unknown topic.");
  if (!KINDS.includes(note.kind)) return bad("Choose comment, question or criticism.");
  if (!RELATIONS.includes(note.relation)) return bad("Say how the talk relates to the topic.");
  if (note.horizon_months !== null && !HORIZONS.includes(note.horizon_months)) return bad("Pick a time between “already happened” and 5 years.");
  if (note.point.length < 3) return bad("Write your main point in a few words.");
  const joined = [note.point, note.why, note.evidence].filter(Boolean).join("\n\n");

  let secret;
  try { secret = requireSecret(request, env); } catch { return bad("The server is missing SESSION_SECRET.", 503); }
  const netHash = await keyedHash(secret, "ip", clientIp(request));
  const personHash = await keyedHash(secret, "participant", participant.id);
  if (await overLimit(env, "device_hash", personHash, PERSON_LIMIT))
    return bad(`You have posted ${PERSON_LIMIT} notes in ${RATE_WINDOW_MIN} minutes. Try again shortly.`, 429);
  if (await overLimit(env, "net_hash", netHash, NETWORK_LIMIT))
    return bad("Lots of notes are coming in from this network. Try again in a few minutes.", 429);

  const { id } = await env.DB.prepare(
    `INSERT INTO notes (item_id, topic, kind, relation, horizon_months, horizon_note, point, why, evidence, body,
                        participant_id, show_name, device_hash, net_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) RETURNING id`
  ).bind(note.item_id, note.topic, note.kind, note.relation, note.horizon_months, note.horizon_note,
         note.point, note.why, note.evidence, joined, participant.id, note.show_name, personHash, netHash).first();
  const saved = await env.DB.prepare(
    `SELECT ${PUBLIC_NOTE} FROM notes n LEFT JOIN participant p ON p.id = n.participant_id WHERE n.id = ?1`
  ).bind(id).first();
  return json({ note: saved }, 201);
}
