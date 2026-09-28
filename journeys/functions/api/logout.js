// POST /api/logout: forget this device. The participant and their notes stay;
// the access token signs them back in.
import { clearCookieHeader, clearPassCookieHeader } from "./_lib.js";

export async function onRequestPost({ request }) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  headers.append("Set-Cookie", clearCookieHeader(request));
  headers.append("Set-Cookie", clearPassCookieHeader(request));
  return new Response(JSON.stringify({ ok: true }), { headers });
}
