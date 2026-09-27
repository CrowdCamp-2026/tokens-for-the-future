// POST /api/logout: forget this device. The participant and their notes stay.
import { json, clearCookieHeader } from "./_lib.js";

export async function onRequestPost({ request }) {
  return json({ ok: true }, 200, { "Set-Cookie": clearCookieHeader(request) });
}
