// Shared helpers. Sessions, contact normalisation and IP hashing are ported from
// the computational-diplomacy workshop app (Tsinghua SEM, Geneva, Sept 2026).

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
export const bad = (error, status = 400) => json({ error }, status);
export const readJson = request => request.json().catch(() => null);
export const clean = (s, max) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

// ---------------------------------------------------------------------------
// Secret. Fails closed on a real domain: without SESSION_SECRET anyone could
// forge a session cookie. The "dev" fallback only works on localhost.
// ---------------------------------------------------------------------------
export function requireSecret(request, env) {
  if (env.SESSION_SECRET && env.SESSION_SECRET !== "dev") return env.SESSION_SECRET;
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return "dev";
  throw new Error("SESSION_SECRET is not configured");
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg))));
}

// A keyed one-way hash: answers "same network?" or "same person?" without
// storing anything that can be read back.
export const keyedHash = async (secret, kind, value) => (await hmac(secret, `${kind}:${value}`)).slice(0, 22);

export const clientIp = request =>
  request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0].trim() || "0.0.0.0";

// ---------------------------------------------------------------------------
// Signed, stateless session cookie: HMAC-SHA256 over a small JSON payload.
// ---------------------------------------------------------------------------
const COOKIE = "cwj_session";
const MAX_AGE = 60 * 60 * 24 * 5;  // five days: the conference plus a margin

export async function signSession(payload, secret) {
  const data = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + MAX_AGE })));
  return `${data}.${await hmac(secret, data)}`;
}

async function verifySession(value, secret) {
  if (!value || !value.includes(".")) return null;
  const [data, sig] = value.split(".");
  if (sig !== await hmac(secret, data)) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
    return body.exp && body.exp < Date.now() / 1000 ? null : body;
  } catch { return null; }
}

function readCookie(request) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE) return rest.join("=");
  }
  return null;
}

const secure = request => (new URL(request.url).protocol === "https:" ? "; Secure" : "");
export const cookieHeader = (request, value) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure(request)}; Max-Age=${MAX_AGE}`;
export const clearCookieHeader = request => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure(request)}; Max-Age=0`;

// The signed-in participant, or null. An erased participant is signed out.
export async function currentParticipant(request, env) {
  let secret;
  try { secret = requireSecret(request, env); } catch { return null; }
  const session = await verifySession(readCookie(request), secret);
  if (!session?.pid) return null;
  const p = await env.DB.prepare("SELECT * FROM participant WHERE id = ?1").bind(session.pid).first();
  return p && !p.erased_at ? p : null;
}

export const publicParticipant = p => ({
  name: p.name, affiliation: p.affiliation, contact: p.contact, contact_kind: p.contact_kind, follow_up: !!p.follow_up,
});

// ---------------------------------------------------------------------------
// Contacts. THE CONTACT IS THE IDENTITY: typing the same email or number on
// another device resumes the same participant. It is not verified; someone who
// knows a colleague's email could sign in as them. That is the accepted limit
// of a no-password conference tool.
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Italy keeps its trunk zero (landlines like 06 for Rome); everyone else drops it.
const TRUNK_ZERO_KEPT = new Set(["39"]);

// Normalise so "T.Maillart@Example.org " and "+41 79 123 45 67" land on one row.
export function normaliseContact(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.includes("@")) {
    const value = s.toLowerCase();
    return EMAIL_RE.test(value) ? { value, kind: "email" } : null;
  }
  let digits = s.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "").replace(/^00/, "+");
  const bare = digits.replace(/^\+/, "");
  if (bare.length >= 7 && bare.length <= 15 && /^\d+$/.test(bare)) {
    return { value: digits.startsWith("+") ? digits : "+" + digits, kind: "phone" };
  }
  return null;
}

// A dialling code plus a national number, composed into E.164. Swiss
// "079 123 45 67" is "+41 79 123 45 67": the trunk zero is dropped, or the same
// person joining at home and reconnecting abroad lands on two rows.
export function composePhone(dial, number) {
  const d = String(dial || "").replace(/\D/g, "");
  const raw = String(number || "").trim();
  if (!d) return null;
  if (/^(\+|00)/.test(raw)) return normaliseContact(raw);  // a full international number wins
  let n = raw.replace(/\D/g, "");
  if (!n) return null;
  if (!TRUNK_ZERO_KEPT.has(d)) n = n.replace(/^0/, "");
  return normaliseContact("+" + d + n);
}

// ---------------------------------------------------------------------------
// Local development bypass. Needs BOTH DEV_BYPASS=1 (set only in .dev.vars,
// never deployed) AND a localhost address, so it cannot switch on in production.
// ---------------------------------------------------------------------------
export function devBypass(request, env) {
  const host = new URL(request.url).hostname;
  return env.DEV_BYPASS === "1" && (host === "localhost" || host === "127.0.0.1");
}
