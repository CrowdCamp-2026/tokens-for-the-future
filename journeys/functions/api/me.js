// GET  /api/me: who is signed in on this device (and whether as an admin), plus the country the network
//      reports, so the splash page's phone picker opens on the right code.
// POST /api/me {name, affiliation, follow_up, contact | dial+number}: edit your own details.
//      The pseudonym never changes here. A new email or number must not belong to another sign-in,
//      because the contact is how people get back in.
import {
  json, bad, readJson, clean, currentParticipant, publicParticipant, adminIdentity, normaliseContact, composePhone,
} from "./_lib.js";

export async function onRequestGet({ request, env }) {
  const p = await currentParticipant(request, env);
  const country = request.headers.get("CF-IPCountry") || null;
  // Admin status comes from the admin cookie only (set by the console), never from the email typed at sign-in.
  const a = await adminIdentity(request, env, { allowDev: false });
  const admin = a && (a.via === "cookie" || a.via === "dev") ? { email: a.email, role: a.role } : null;
  return json({ participant: p ? publicParticipant(p) : null, country, admin });
}

export async function onRequestPost({ request, env }) {
  const p = await currentParticipant(request, env);
  if (!p) return bad("Sign in first.", 401);
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
  if (contact.value !== p.contact) {
    const other = await env.DB.prepare("SELECT id FROM participant WHERE contact = ?1 AND id != ?2").bind(contact.value, p.id).first();
    if (other) return bad("That email or number is already used by another sign-in. Use a different one, or sign in with it instead.", 409);
  }
  const followUp = body.follow_up ? 1 : 0;

  await env.DB.prepare(
    "UPDATE participant SET name = ?1, affiliation = ?2, contact = ?3, contact_kind = ?4, follow_up = ?5, last_seen_at = ?6 WHERE id = ?7"
  ).bind(name, affiliation, contact.value, contact.kind, followUp, new Date().toISOString(), p.id).run();
  return json({ participant: publicParticipant({ ...p, name, affiliation, contact: contact.value, contact_kind: contact.kind, follow_up: followUp }) });
}
