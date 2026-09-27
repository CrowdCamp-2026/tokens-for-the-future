// GET /api/me: who is signed in on this device (and whether as an admin), plus the country the network
// reports, so the splash page's phone picker opens on the right code.
import { json, currentParticipant, publicParticipant, adminIdentity } from "./_lib.js";

export async function onRequestGet({ request, env }) {
  const p = await currentParticipant(request, env);
  const country = request.headers.get("CF-IPCountry") || null;
  // Admin status comes from the admin cookie only (set by the console), never from the email typed at sign-in.
  const a = await adminIdentity(request, env, { allowDev: false });
  const admin = a && (a.via === "cookie" || a.via === "dev") ? { email: a.email, role: a.role } : null;
  return json({ participant: p ? publicParticipant(p) : null, country, admin });
}
