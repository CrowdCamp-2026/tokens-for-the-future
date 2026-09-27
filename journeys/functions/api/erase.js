// POST /api/erase  { confirm: "<your name>" }
//
// Self-service erasure, so the right the privacy notice promises does not
// depend on an organiser reading their mail. Only the signed-in person can
// erase their own record, confirmed by typing their name (the
// delete-repository pattern: a lone button is too easy to hit on a phone).
//
// ERASED: name, affiliation, pseudonym, contact, network hash, country. The contact is
//   nulled, so the record can never be signed back into.
// KEPT: the notes, shown as "Anonymous" from then on. Topic summaries count
//   notes by content, never by who wrote them, so nothing else changes.
import { json, bad, readJson, currentParticipant, clearCookieHeader } from "./_lib.js";

export async function onRequestPost({ request, env }) {
  const p = await currentParticipant(request, env);
  if (!p) return bad("Sign in first. Erasure applies to your own record only.", 401);

  const body = await readJson(request);
  // Case-insensitive, so a phone keyboard's autocapitalisation cannot block it.
  if (String(body?.confirm || "").trim().toLowerCase() !== String(p.name).toLowerCase()) {
    return bad("Type your name exactly as you entered it, to confirm.");
  }

  const at = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE participant SET name = NULL, affiliation = NULL, pseudo = NULL, contact = NULL, contact_kind = NULL,
              follow_up = 0, net_hash = NULL, country = NULL, erased_at = ?1 WHERE id = ?2`
    ).bind(at, p.id),
    env.DB.prepare("UPDATE notes SET show_name = 0, author = NULL WHERE participant_id = ?1").bind(p.id),
  ]);
  const kept = await env.DB.prepare("SELECT COUNT(*) AS n FROM notes WHERE participant_id = ?1").bind(p.id).first();
  return json({ ok: true, notes_kept: kept?.n || 0 }, 200, { "Set-Cookie": clearCookieHeader(request) });
}
