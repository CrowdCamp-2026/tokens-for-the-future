// POST /api/erase  { confirm: "<your pseudonym>" }
//
// Self-service erasure, so the right the privacy notice promises does not
// depend on an organiser reading their mail. Only the signed-in person can
// erase their own record, confirmed by typing their pseudonym (the
// delete-repository pattern: a lone button is too easy to hit on a phone).
//
// ERASED: the pseudonym, the link to the access token (invite_id), and any
//   name, affiliation or contact left from the older sign-up. Once unlinked,
//   the organizers' token list no longer leads to these notes.
// KEPT: the notes, shown as "Anonymous" from then on. The token still opens
//   the app, as a new participant.
import { bad, readJson, currentParticipant, clearCookieHeader, clearPassCookieHeader } from "./_lib.js";

export async function onRequestPost({ request, env }) {
  const p = await currentParticipant(request, env);
  if (!p) return bad("Sign in first. Erasure applies to your own record only.", 401);

  const body = await readJson(request);
  // Case-insensitive, so a phone keyboard's autocapitalisation cannot block it.
  if (String(body?.confirm || "").trim().toLowerCase() !== String(p.pseudo || "").toLowerCase()) {
    return bad("Type your pseudonym exactly as it is shown, to confirm.");
  }

  const at = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE participant SET invite_id = NULL, pseudo = NULL, name = NULL, affiliation = NULL, contact = NULL, contact_kind = NULL,
              follow_up = 0, net_hash = NULL, country = NULL, erased_at = ?1 WHERE id = ?2`
    ).bind(at, p.id),
    env.DB.prepare("UPDATE notes SET show_name = 0, author = NULL WHERE participant_id = ?1").bind(p.id),
  ]);
  const kept = await env.DB.prepare("SELECT COUNT(*) AS n FROM notes WHERE participant_id = ?1").bind(p.id).first();
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  headers.append("Set-Cookie", clearCookieHeader(request));
  headers.append("Set-Cookie", clearPassCookieHeader(request));
  return new Response(JSON.stringify({ ok: true, notes_kept: kept?.n || 0 }), { headers });
}
