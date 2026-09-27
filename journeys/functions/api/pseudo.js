// Change your pseudonym.
//   GET  /api/pseudo?check=Wise%20Heron   is it free?  { pseudo, available, error? }
//   GET  /api/pseudo?draw=1               a free themed one  { pseudo }
//   POST /api/pseudo  { pseudo }          take it  { participant }
// Notes show the writer's current pseudonym, so a change also renames earlier notes.
import { json, bad, readJson, currentParticipant, publicParticipant } from "./_lib.js";
import { freshPseudo, checkPseudo } from "./_pseudos.js";

export async function onRequestGet({ request, env }) {
  const p = await currentParticipant(request, env);
  if (!p) return bad("Sign in first.", 401);
  const url = new URL(request.url);
  if (url.searchParams.has("draw")) return json({ pseudo: await freshPseudo(env.DB) });
  const { pseudo, error } = await checkPseudo(env.DB, url.searchParams.get("check"), p);
  return json({ pseudo, available: !error, ...(error ? { error } : {}) });
}

export async function onRequestPost({ request, env }) {
  const p = await currentParticipant(request, env);
  if (!p) return bad("Sign in first.", 401);
  const body = await readJson(request);
  if (!body) return bad("Send the new pseudonym as JSON.");
  const { pseudo, error } = await checkPseudo(env.DB, body.pseudo, p);
  if (error) return bad(error, 409);
  try {
    await env.DB.prepare("UPDATE participant SET pseudo = ?1 WHERE id = ?2").bind(pseudo, p.id).run();
  } catch (e) {
    // Someone took the same name a moment ago; the unique index caught it.
    if (/UNIQUE/i.test(String(e?.message))) return bad("Someone already goes by that name. Pick another.", 409);
    throw e;
  }
  return json({ participant: publicParticipant({ ...p, pseudo }) });
}
