// GET  /api/feedback                 all feedback, most +1s first
// POST /api/feedback {kind, body, page, viewport}   add feedback
// POST /api/feedback {vote: <id>}    toggle your +1 on an item
// Admins only: the organizing team uses this to shape the app. An admin is
// recognized by the admin cookie (set when they open the console with their
// token), a token header, or Cloudflare Access. See adminIdentity in _lib.js.
import { json, bad, readJson, clean, adminIdentity } from "./_lib.js";

const KINDS = ["bug", "idea", "wording", "other"];
const LIMIT = 30;  // items per admin per 10 minutes

const text = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

async function list(env, me) {
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.created_at, f.kind, f.body, f.page, f.status, f.author_email AS author,
            (SELECT COUNT(*) FROM feedback_vote v WHERE v.feedback_id = f.id) AS votes,
            EXISTS (SELECT 1 FROM feedback_vote v WHERE v.feedback_id = f.id AND v.voter = ?1) AS mine
       FROM feedback f
      WHERE f.hidden = 0
      ORDER BY CASE f.status WHEN 'open' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, votes DESC, f.created_at DESC
      LIMIT 500`
  ).bind(me).all();
  return results.map(r => ({ ...r, mine: !!r.mine }));
}

// Local development counts as admin only through the console's ?dev sign-in,
// so the "admins only" rule can be tried out locally.
const whoIs = (request, env) => adminIdentity(request, env, { allowDev: false });

export async function onRequestGet({ request, env }) {
  const who = await whoIs(request, env);
  if (!who) return bad("Feedback is for the organizing team. Open the console with your admin token first.", 403);
  return json({ items: await list(env, who.email) });
}

export async function onRequestPost({ request, env }) {
  const who = await whoIs(request, env);
  if (!who) return bad("Feedback is for the organizing team. Open the console with your admin token first.", 403);
  const body = await readJson(request);
  if (!body) return bad("Send feedback as JSON.");

  if (body.vote !== undefined) {
    const id = Number(body.vote);
    const item = await env.DB.prepare("SELECT id FROM feedback WHERE id = ?1 AND hidden = 0").bind(id).first();
    if (!item) return bad("That feedback no longer exists.", 404);
    const had = await env.DB.prepare("SELECT 1 FROM feedback_vote WHERE feedback_id = ?1 AND voter = ?2").bind(id, who.email).first();
    await env.DB.prepare(had
      ? "DELETE FROM feedback_vote WHERE feedback_id = ?1 AND voter = ?2"
      : "INSERT INTO feedback_vote (feedback_id, voter) VALUES (?1, ?2)").bind(id, who.email).run();
    return json({ items: await list(env, who.email) });
  }

  const kind = String(body.kind || "");
  const content = text(body.body, 3000);
  if (!KINDS.includes(kind)) return bad("Choose bug, idea, wording or other.");
  if (content.length < 5) return bad("Say a little more, so we can act on it.");
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM feedback WHERE author_email = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')"
  ).bind(who.email).first();
  if (recent.n >= LIMIT) return bad("That is a lot of feedback in ten minutes. Thank you! Try again shortly.", 429);

  await env.DB.prepare(
    "INSERT INTO feedback (author_email, kind, body, page, viewport) VALUES (?1, ?2, ?3, ?4, ?5)"
  ).bind(who.email, kind, content, clean(body.page, 80) || null, clean(body.viewport, 20) || null).run();
  return json({ items: await list(env, who.email) }, 201);
}
