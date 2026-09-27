// POST /api/join  { name, affiliation, contact } or { name, affiliation, dial, number }, plus follow_up
//
// The splash page's door. No password, no email link: a conference hallway
// cannot spend minutes on inbox round-trips. The contact is the identity, so
// the same email or number on another device resumes the same participant,
// and the name and affiliation typed last are kept.
import {
  json, bad, readJson, clean, requireSecret, keyedHash, clientIp, signSession, cookieHeader,
  normaliseContact, composePhone, publicParticipant,
} from "./_lib.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return bad("Send your details as JSON.");

  const name = clean(body.name, 80);
  const affiliation = clean(body.affiliation, 120);
  if (name.length < 2) return bad("Add your name.");
  if (affiliation.length < 2) return bad("Add your affiliation, or “independent”.");
  const contact = body.dial ? composePhone(body.dial, body.number) : normaliseContact(body.contact);
  if (!contact) {
    return bad(body.dial
      ? "That does not look like a phone number. Type it as you would at home, without the country code."
      : "Add an email address or a phone number. It is how you get back in on another device.");
  }
  const followUp = body.follow_up ? 1 : 0;

  let secret;
  try { secret = requireSecret(request, env); } catch { return bad("The server is missing SESSION_SECRET.", 503); }
  const netHash = await keyedHash(secret, "ip", clientIp(request));
  const country = request.headers.get("CF-IPCountry") || null;
  const at = new Date().toISOString();

  const existing = await env.DB.prepare("SELECT * FROM participant WHERE contact = ?1").bind(contact.value).first();
  let participant;
  if (existing) {
    await env.DB.prepare(
      "UPDATE participant SET name = ?1, affiliation = ?2, follow_up = ?3, net_hash = ?4, country = ?5, last_seen_at = ?6 WHERE id = ?7"
    ).bind(name, affiliation, followUp, netHash, country, at, existing.id).run();
    participant = { ...existing, name, affiliation, follow_up: followUp };
  } else {
    participant = { id: crypto.randomUUID(), name, affiliation, contact: contact.value, contact_kind: contact.kind, follow_up: followUp };
    await env.DB.prepare(
      `INSERT INTO participant (id, name, affiliation, contact, contact_kind, follow_up, net_hash, country, last_seen_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    ).bind(participant.id, name, affiliation, contact.value, contact.kind, followUp, netHash, country, at).run();
  }

  const token = await signSession({ pid: participant.id }, secret);
  return json({ ok: true, returning: !!existing, participant: publicParticipant(participant) }, 200,
    { "Set-Cookie": cookieHeader(request, token) });
}
