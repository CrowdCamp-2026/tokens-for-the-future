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

export async function verifySession(value, secret) {
  if (!value || !value.includes(".")) return null;
  const [data, sig] = value.split(".");
  if (sig !== await hmac(secret, data)) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
    return body.exp && body.exp < Date.now() / 1000 ? null : body;
  } catch { return null; }
}

export function readCookie(request, name = COOKIE) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

const secure = request => (new URL(request.url).protocol === "https:" ? "; Secure" : "");
export const cookieHeader = (request, value) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure(request)}; Max-Age=${MAX_AGE}`;
export const clearCookieHeader = request => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure(request)}; Max-Age=0`;

// The admin cookie, set when an admin opens the console with their token.
// It lets the same browser use admin-only parts of the app (the feedback box).
const ADMIN_COOKIE = "cwj_admin";
export const adminCookieHeader = (request, value) => `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure(request)}; Max-Age=${MAX_AGE}`;
export const clearAdminCookieHeader = request => `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure(request)}; Max-Age=0`;

// The participant pass, set when someone enters their access token (or opens
// its link, ?t=…). It names the token's invite id, so revoking a token ends its passes.
// See functions/_middleware.js.
export const PASS_COOKIE = "cwj_pass";
export const passCookieHeader = (request, value) => `${PASS_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure(request)}; Max-Age=${MAX_AGE}`;

// Access tokens. Organizers send each willing participant a personal token in
// a Slack DM. The super admin generates them in batches from the console and
// downloads them once, as a CSV for assigning; the server keeps only the
// SHA-256 of each token (invite.token_hash), as for the admin tokens.
//
// A token is 24 characters from 32 symbols, digits 2-9 and letters without I
// and O (120 random bits), shown in groups of four: K7QM-3XWP-9HTC-VD2R-6NBF-JAYE.
// Typed tokens are read case-insensitively, ignoring spaces and hyphens.
const TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";  // 32 symbols: one random byte & 31 picks one without bias
const TOKEN_LENGTH = 24;
export const MAX_INVITE_BATCH = 500;

export function newAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  const raw = [...bytes].map(b => TOKEN_ALPHABET[b & 31]).join("");
  return raw.match(/.{4}/g).join("-");
}

// The canonical form hashed and compared: upper case, letters and digits only.
export const normaliseToken = s => String(s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
export const tokenHash = s => sha256Hex(normaliseToken(s));

// The invite a typed or linked token belongs to, or null (unknown or revoked).
export async function findInvite(env, token) {
  const t = normaliseToken(token);
  if (t.length < 20) return null;
  return env.DB.prepare("SELECT id FROM invite WHERE token_hash = ?1 AND revoked_at IS NULL")
    .bind(await sha256Hex(t)).first().catch(() => null);
}

// Whether any token exists yet (the gate stays open on localhost until then), and
// the revoked ones, whose passes stop working. Cached per isolate for 15 seconds.
let inviteCache = null;
export async function inviteState(env) {
  if (inviteCache && Date.now() - inviteCache.at < 15000) return inviteCache.value;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM invite").first().catch(() => null);
  const { results = [] } = await env.DB.prepare("SELECT id FROM invite WHERE revoked_at IS NOT NULL").all().catch(() => ({ results: [] }));
  const value = { any: (row?.n || 0) > 0, revoked: new Set(results.map(r => r.id)) };
  inviteCache = { at: Date.now(), value };
  return value;
}
export const forgetInviteState = () => { inviteCache = null; };

export const countInviteUse = (env, id) => env.DB.prepare(
  "UPDATE invite SET uses = uses + 1, first_used_at = COALESCE(first_used_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) WHERE id = ?1"
).bind(id).run().catch(() => {});

// A new batch of n tokens: [{ id, token }], shown to the super admin once.
export async function createInvites(env, n, by) {
  const batch = new Date().toISOString();
  const tokens = Array.from({ length: n }, newAccessToken);
  const stmts = [];
  for (const t of tokens) {
    stmts.push(env.DB.prepare("INSERT INTO invite (token_hash, batch, created_by) VALUES (?1, ?2, ?3) RETURNING id")
      .bind(await tokenHash(t), batch, by));
  }
  const res = await env.DB.batch(stmts);
  forgetInviteState();
  return tokens.map((token, i) => ({ id: res[i].results[0].id, token }));
}

export async function revokeInvite(env, id) {
  const { meta } = await env.DB.prepare(
    "UPDATE invite SET revoked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1 AND revoked_at IS NULL"
  ).bind(id).run();
  forgetInviteState();
  return meta.changes > 0;
}

export async function inviteStats(env) {
  const r = await env.DB.prepare(
    "SELECT COUNT(*) AS total, COUNT(first_used_at) AS used, COUNT(revoked_at) AS revoked FROM invite"
  ).first().catch(() => null);
  return { total: r?.total || 0, used: r?.used || 0, revoked: r?.revoked || 0 };
}

export const accessLink = (request, token) => `${new URL(request.url).origin}/?t=${token}`;

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
  pseudo: p.pseudo, name: p.name, affiliation: p.affiliation, contact: p.contact, contact_kind: p.contact_kind, follow_up: !!p.follow_up,
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

// ---------------------------------------------------------------------------
// Admins. Each admin has a personal token and a role ("admin" or "super").
// ADMIN_TOKENS is a JSON list of {email, role, hash}, where hash is the SHA-256
// of the token (hex): the server never holds a working token. Generate with
// build/make-admin-tokens.mjs. Optionally, Cloudflare Access can front
// /console and /api/admin; its signed JWT (Cf-Access-Jwt-Assertion) is verified
// here and mapped to the same list by email.
// ---------------------------------------------------------------------------
export function adminList(env) {
  try {
    const list = JSON.parse(env.ADMIN_TOKENS || "[]");
    return Array.isArray(list) ? list.filter(a => a && a.email && a.hash && ["admin", "super"].includes(a.role))
      .map(a => ({ email: String(a.email).toLowerCase(), role: a.role, hash: String(a.hash).toLowerCase() })) : [];
  } catch { return []; }
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Compare two equal-length hex strings without an early exit.
export function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const b64urlBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

let certsCache = null;  // { at, keys }, per isolate
async function accessKeys(team) {
  if (certsCache && Date.now() - certsCache.at < 60 * 60 * 1000) return certsCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("Could not load Access signing keys");
  const { keys } = await res.json();
  certsCache = { at: Date.now(), keys };
  return keys;
}

// The verified email from a Cloudflare Access JWT, or null.
// `keys` can be passed in by tests; otherwise they are fetched from the team domain.
export async function verifyAccessJwt(token, { team, aud, keys } = {}) {
  if (!token || !team || !aud) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, claims;
  try { header = b64urlJson(parts[0]); claims = b64urlJson(parts[1]); } catch { return null; }
  if (header.alg !== "RS256") return null;
  const jwk = (keys || await accessKeys(team)).find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;
  const now = Date.now() / 1000;
  const audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
  if (!audOk || claims.iss !== `https://${team}` || !(claims.exp > now) || (claims.nbf && claims.nbf > now + 60)) return null;
  return typeof claims.email === "string" ? claims.email.toLowerCase() : null;
}

// Who is acting as admin, or null: { email, role: "admin" | "super", via: "token" | "access" | "dev" }.
export async function adminIdentity(request, env, { allowDev = true } = {}) {
  const admins = adminList(env);
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const hash = await sha256Hex(token);
    const a = admins.find(x => sameHex(x.hash, hash));
    if (a) return { email: a.email, role: a.role, via: "token", h: a.hash.slice(0, 16) };
  }
  // The admin cookie names the token it came from (first 16 hex of its hash), so
  // rotating ADMIN_TOKENS also signs out every admin cookie.
  let secret = null;
  try { secret = requireSecret(request, env); } catch { /* no cookie check without a secret */ }
  const cookie = secret && await verifySession(readCookie(request, ADMIN_COOKIE), secret);
  if (cookie?.adm) {
    if (cookie.h === "dev" && devBypass(request, env)) return { email: cookie.adm, role: cookie.role, via: "dev" };
    const a = admins.find(x => x.email === cookie.adm && x.hash.startsWith(cookie.h || "-"));
    if (a) return { email: a.email, role: a.role, via: "cookie", h: cookie.h };
  }
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (jwt && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const email = await verifyAccessJwt(jwt, { team: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD }).catch(() => null);
    const a = email && admins.find(x => x.email === email);
    if (a) return { email: a.email, role: a.role, via: "access" };
  }
  // Local development only, and only when no token was sent, so roles can still be tested.
  if (allowDev && !token && devBypass(request, env)) return { email: "local developer", role: "super", via: "dev", h: "dev" };
  return null;
}
