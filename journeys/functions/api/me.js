// GET /api/me: who is signed in on this device, plus the country the network
// reports, so the splash page's phone picker opens on the right code.
import { json, currentParticipant, publicParticipant } from "./_lib.js";

export async function onRequestGet({ request, env }) {
  const p = await currentParticipant(request, env);
  const country = request.headers.get("CF-IPCountry") || null;
  return json({ participant: p ? publicParticipant(p) : null, country });
}
