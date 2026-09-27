// POST /api/signin  { contact } or { dial, number }
//
// Sign back in on another device, or after signing out, with only the email or
// phone number used at sign-up. Name, affiliation, pseudonym and notes are kept.
// Like sign-up, this trusts the contact (see "THE CONTACT IS THE IDENTITY" in _lib.js).
import {
  json, bad, readJson, requireSecret, keyedHash, clientIp, signSession, cookieHeader,
  normaliseContact, composePhone, publicParticipant,
} from "./_lib.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return bad("Send your email or phone number as JSON.");
  const contact = body.dial ? composePhone(body.dial, body.number) : normaliseContact(body.contact);
  if (!contact) {
    return bad(body.dial
      ? "That does not look like a phone number. Type it as you would at home, without the country code."
      : "Type the email address or phone number you signed up with.");
  }
  let secret;
  try { secret = requireSecret(request, env); } catch { return bad("The server is missing SESSION_SECRET.", 503); }

  const p = await env.DB.prepare("SELECT * FROM participant WHERE contact = ?1 AND erased_at IS NULL").bind(contact.value).first();
  if (!p) {
    return bad(`Nobody signed up with that ${contact.kind === "phone" ? "number" : "email"}. Check it, or choose “New here” to sign up.`, 404);
  }
  const netHash = await keyedHash(secret, "ip", clientIp(request));
  await env.DB.prepare("UPDATE participant SET net_hash = ?1, country = ?2, last_seen_at = ?3 WHERE id = ?4")
    .bind(netHash, request.headers.get("CF-IPCountry") || null, new Date().toISOString(), p.id).run();

  const token = await signSession({ pid: p.id }, secret);
  return json({ ok: true, returning: true, participant: publicParticipant(p) }, 200, { "Set-Cookie": cookieHeader(request, token) });
}
