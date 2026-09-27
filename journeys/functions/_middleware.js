// Participants only. Every page and API call needs one of:
//   - the key of one of the participant links (?k=…), shared with its QR code in the
//     conference Slack or on a poster,
//   - the pass cookie a link sets (it names the key it came from, so resetting or
//     deleting a link locks out its passes and no others),
//   - a participant session (someone who already signed in),
//   - an admin token or admin cookie.
// The keys live in the participant_key table, up to 5. A super admin creates,
// labels, resets and deletes them, and gets each link and QR code, in the console.
//
// Fails closed on a real domain: until a link exists everything is locked. On
// localhost the gate stays off until a link is created.
import {
  requireSecret, sha256Hex, sameHex, signSession, verifySession, readCookie,
  adminIdentity, PASS_COOKIE, passCookieHeader, participantKeys, keyTag, countParticipantOpen,
} from "./api/_lib.js";

// Reachable without the key: the privacy notice, the stylesheet the locked page
// uses, the organizer console and its QR library (its API checks admin tokens
// itself) and the localhost-only dev routes.
const OPEN = [/^\/privacy(\.html)?$/, /^\/styles\.css$/, /^\/console(\.html|\.js)?$/, /^\/vendor\/qrcode\.min\.js$/, /^\/api\/admin(\/|$)/, /^\/api\/dev\//];

const isLocal = url => url.hostname === "localhost" || url.hostname === "127.0.0.1";

export async function onRequest({ request, env, next, waitUntil }) {
  const url = new URL(request.url);
  if (OPEN.some(re => re.test(url.pathname))) return next();

  const keys = await participantKeys(env);
  if (!keys.length) return isLocal(url) ? next() : locked(url, "unset");
  let secret;
  try { secret = requireSecret(request, env); } catch { return locked(url, "unset"); }
  const tags = new Set(keys.map(keyTag));

  const key = url.searchParams.get("k");
  if (key !== null) {
    // Take the key out of the address bar, so it does not end up in history,
    // screenshots or links people copy from the app.
    url.searchParams.delete("k");
    const clean = url.pathname + url.search;
    const hash = await sha256Hex(key.trim());
    const hit = keys.find(k => sameHex(hash, k.hash));
    if (hit) {
      const count = countParticipantOpen(env, hit.id);
      if (waitUntil) waitUntil(count); else await count;
      const pass = await signSession({ pk: keyTag(hit) }, secret);
      return redirect(clean, passCookieHeader(request, pass));
    }
    // An old or deleted link: fine for someone already in, a dead end for anyone else.
    return (await allowed(request, env, secret, tags)) ? redirect(clean) : locked(url, "stale");
  }
  return (await allowed(request, env, secret, tags)) ? next() : locked(url);
}

async function allowed(request, env, secret, tags) {
  if (tags.has((await verifySession(readCookie(request, PASS_COOKIE), secret))?.pk)) return true;
  if ((await verifySession(readCookie(request), secret))?.pid) return true;
  return !!(await adminIdentity(request, env, { allowDev: false }));
}

const redirect = (location, cookie) => new Response(null, {
  status: 302, headers: { Location: location, "cache-control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) },
});

const MESSAGES = {
  closed: "Tokens of the Future is for HCOMP + CI 2026 participants. Open it from the link or QR code posted in the conference Slack.",
  stale: "This link no longer works. Open the latest link or QR code posted in the conference Slack.",
  unset: "The app is not open yet. The organizers still have to create a participant link.",
};

function locked(url, why = "closed") {
  const status = why === "unset" ? 503 : 403;
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: MESSAGES[why] }), {
      status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
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
  <p class="lede">${MESSAGES[why]}</p>
  <p><a href="/privacy.html">Privacy notice</a></p>
</main>
</body>
</html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
