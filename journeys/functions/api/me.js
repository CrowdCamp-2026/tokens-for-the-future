// GET /api/me: who is signed in on this device (their pseudonym), and whether as an admin.
// There is nothing else to edit: the access token is the identity. The pseudonym
// is changed through /api/pseudo.
import { json, currentParticipant, publicParticipant, adminIdentity } from "./_lib.js";

export async function onRequestGet({ request, env }) {
  const p = await currentParticipant(request, env);
  // Admin status comes from the admin cookie only (set by the console).
  const a = await adminIdentity(request, env, { allowDev: false });
  const admin = a && (a.via === "cookie" || a.via === "dev") ? { email: a.email, role: a.role } : null;
  return json({ participant: p ? publicParticipant(p) : null, admin });
}
