// GET  /api/feedback                 all feedback, most +1s first, with who wrote it
// POST /api/feedback {kind, body, page, viewport}   add feedback
// POST /api/feedback {vote: <id>}    toggle your +1 on an item
// Signed-in participants only: this is for colleagues building the app together.
import { json, bad, readJson, clean, currentParticipant } from "./_lib.js";

const KINDS = ["bug", "idea", "wording", "other"];
const LIMIT = 20;  // items per person per 10 minutes

const text = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

async function list(env, pid) {
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.created_at, f.kind, f.body, f.page, f.status,
            CASE WHEN p.erased_at IS NULL THEN p.name END AS author,
            CASE WHEN p.erased_at IS NULL THEN p.affiliation END AS affiliation,
            (SELECT COUNT(*) FROM feedback_vote v WHERE v.feedback_id = f.id) AS votes,
            EXISTS (SELECT 1 FROM feedback_vote v WHERE v.feedback_id = f.id AND v.participant_id = ?1) AS mine
       FROM feedback f LEFT JOIN participant p ON p.id = f.participant_id
      WHERE f.hidden = 0
      ORDER BY CASE f.status WHEN 'open' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, votes DESC, f.created_at DESC
      LIMIT 500`
  ).bind(pid).all();
  return results.map(r => ({ ...r, mine: !!r.mine }));
}

export async function onRequestGet({ request, env }) {
  const p = await currentParticipant(request, env);
  if (!p) return bad("Sign in to see feedback.", 401);
  return json({ items: await list(env, p.id) });
}

export async function onRequestPost({ request, env }) {
  const p = await currentParticipant(request, env);
  if (!p) return bad("Sign in to leave feedback.", 401);
  const body = await readJson(request);
  if (!body) return bad("Send feedback as JSON.");

  if (body.vote !== undefined) {
    const id = Number(body.vote);
    const item = await env.DB.prepare("SELECT id FROM feedback WHERE id = ?1 AND hidden = 0").bind(id).first();
    if (!item) return bad("That feedback no longer exists.", 404);
    const had = await env.DB.prepare("SELECT 1 FROM feedback_vote WHERE feedback_id = ?1 AND participant_id = ?2").bind(id, p.id).first();
    await env.DB.prepare(had
      ? "DELETE FROM feedback_vote WHERE feedback_id = ?1 AND participant_id = ?2"
      : "INSERT INTO feedback_vote (feedback_id, participant_id) VALUES (?1, ?2)").bind(id, p.id).run();
    return json({ items: await list(env, p.id) });
  }

  const kind = String(body.kind || "");
  const text_ = text(body.body, 3000);
  if (!KINDS.includes(kind)) return bad("Choose bug, idea, wording or other.");
  if (text_.length < 5) return bad("Say a little more, so we can act on it.");
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM feedback WHERE participant_id = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')"
  ).bind(p.id).first();
  if (recent.n >= LIMIT) return bad("That is a lot of feedback in ten minutes. Thank you! Try again shortly.", 429);

  await env.DB.prepare(
    "INSERT INTO feedback (participant_id, kind, body, page, viewport) VALUES (?1, ?2, ?3, ?4, ?5)"
  ).bind(p.id, kind, text_, clean(body.page, 80) || null, clean(body.viewport, 20) || null).run();
  return json({ items: await list(env, p.id) }, 201);
}
