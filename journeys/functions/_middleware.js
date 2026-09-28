// Participants only. Every page and API call needs one of:
//   - a pass cookie, set when someone enters their personal access token on the
//     locked page (POST /api/access) or opens its link (?t=…); it names the
//     token's invite, so revoking a token ends its passes,
//   - an admin token or admin cookie.
// Entering the token also signs the person in: the token is the identity, and
// the first time it creates a participant with a random pseudonym. No name,
// affiliation or contact is asked for.
// Organizers send each willing participant a token in a Slack DM. The super
// admin generates them in the console; see the access tokens in api/_lib.js.
//
// Fails closed on a real domain: until a token exists everything is locked. On
// localhost the gate stays off until a token is generated.
import {
  requireSecret, signSession, verifySession, readCookie, adminIdentity, PASS_COOKIE, passCookieHeader,
  cookieHeader, devBypass, inviteState, findInvite, countInviteUse, participantForInvite, publicParticipant,
} from "./api/_lib.js";

// Reachable without a token: the privacy notice, the stylesheet the locked page
// uses, the organizer console (its API checks admin tokens itself) and the
// localhost-only dev routes.
const OPEN = [/^\/privacy(\.html)?$/, /^\/styles\.css$/, /^\/console(\.html|\.js)?$/, /^\/api\/admin(\/|$)/, /^\/api\/dev\//];

const isLocal = url => url.hostname === "localhost" || url.hostname === "127.0.0.1";

export async function onRequest({ request, env, next, waitUntil }) {
  const url = new URL(request.url);
  if (OPEN.some(re => re.test(url.pathname))) return next();

  let secret = null;
  try { secret = requireSecret(request, env); } catch { /* locked below */ }
  // A token is always checked against the database itself, never against the
  // cached state, so a batch works the moment it is generated.
  const token = url.searchParams.get("t");
  if (secret && url.pathname === "/api/access" && request.method === "POST") return enter(request, env, secret, waitUntil);

  const state = await inviteState(env);
  if (!state.any && token === null) {
    // Before any token exists, admins can still use and check the app.
    if (isLocal(url) || await adminIdentity(request, env, { allowDev: false })) return next();
    return locked(url, "unset");
  }
  if (!secret) return locked(url, "unset");

  if (token !== null) {
    // Take the token out of the address bar, so it does not end up in history,
    // screenshots or links people copy from the app.
    url.searchParams.delete("t");
    const clean = url.pathname + url.search;
    const invite = await findInvite(env, token);
    if (invite) {
      const { cookies, returning } = await grant(request, env, secret, invite, waitUntil);
      return redirect(returning ? clean : withNew(clean), cookies);
    }
    return (await allowed(request, env, secret, state)) ? redirect(clean) : locked(url, "bad");
  }
  return (await allowed(request, env, secret, state)) ? next() : locked(url);
}

// The locked page's form (or a JSON client) sends { token }.
async function enter(request, env, secret, waitUntil) {
  const json = (request.headers.get("content-type") || "").includes("json");
  const body = json ? await request.json().catch(() => ({})) : Object.fromEntries(await request.formData().catch(() => new FormData()));
  const invite = await findInvite(env, body?.token);
  if (!invite) return locked(new URL(request.url), "bad", json);
  const { cookies, participant, returning } = await grant(request, env, secret, invite, waitUntil);
  const headers = new Headers({ "cache-control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  if (!json) {
    headers.set("Location", returning ? "/" : withNew("/"));
    return new Response(null, { status: 303, headers });
  }
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify({ ok: true, returning, participant: publicParticipant(participant) }), { headers });
}

// The pass for the gate, and a session for the participant behind the token.
async function grant(request, env, secret, invite, waitUntil) {
  const count = countInviteUse(env, invite.id);
  if (waitUntil) waitUntil(count); else await count;
  const { participant, returning } = await participantForInvite(env, invite.id);
  const cookies = [
    passCookieHeader(request, await signSession({ inv: invite.id }, secret)),
    cookieHeader(request, await signSession({ pid: participant.id }, secret)),
  ];
  return { cookies, participant, returning };
}

// A first-time sign-in lands with ?new, so the app can welcome them and offer another pseudonym.
const withNew = path => path + (path.includes("?") ? "&" : "?") + "new";

async function allowed(request, env, secret, state) {
  const pass = await verifySession(readCookie(request, PASS_COOKIE), secret);
  if (Number.isInteger(pass?.inv) && !state.revoked.has(pass.inv)) return true;
  if (devBypass(request, env) && (await verifySession(readCookie(request), secret))?.pid) return true;  // /api/dev/login, localhost only
  return !!(await adminIdentity(request, env, { allowDev: false }));
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

const MESSAGES = {
  closed: "Tokens of the Future is for HCOMP + CI 2026 participants. Enter the access token the organizers sent you in a Slack message.",
  bad: "That token does not work. Check it against your Slack message, or ask the organizers for a new one.",
  unset: "The app is not open yet. The organizers still have to send out access tokens.",
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function locked(url, why = "closed", asJson = url.pathname.startsWith("/api/")) {
  const status = why === "unset" ? 503 : 403;
  if (asJson) {
    return new Response(JSON.stringify({ error: MESSAGES[why] }), {
      status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const form = why === "unset" ? "" : `
  <form class="join" method="post" action="/api/access">
    <label class="lbl" for="t">Access token</label>
    <input type="text" id="t" name="token" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" required autofocus>
    <button class="btn wide" type="submit">Open the app</button>
    <p class="fine">Paste the token, or the whole link, from your Slack message. No token yet? Ask the CrowdCamp organizers on the conference Slack.</p>
  </form>`;
  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tokens of the Future</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="appbar"><span class="appbar-title">Tokens of the Future</span></header>
<main class="privacy">
  <div class="eyebrow"><span>HCOMP + CI 2026 · Alexandria, VA</span><span>Sep 28–30</span></div>
  <h2 class="topic-title">For conference participants</h2>
  <p class="unofficial">An independent project by CrowdCamp 2026 participants. It is not an official app of HCOMP + CI 2026 or SIGCHI.</p>
  <p class="lede">${esc(MESSAGES[why])}</p>${form}${why === "unset" ? "" : `
  <p class="fine">Tokens of the Future routes you through the conference by one of 13 questions on the future of crowd work. This week you are the crowd and we are your requesters: your token is all you need, on any device, and other participants see only a pseudonym. By continuing you accept the <a href="/privacy.html">privacy notice</a>, which says what we owe you.</p>`}
  <p><a href="/privacy.html">Privacy notice</a></p>
</main>
</body>
</html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
