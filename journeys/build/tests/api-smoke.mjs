// Smoke test for the local API: node build/tests/api-smoke.mjs [base]
const B = (process.argv[2] || "http://127.0.0.1:8792") + "/api";
// Personal tokens from `node build/make-admin-tokens.mjs --dev ...` (admin-tokens.local.txt).
import { readFileSync } from "node:fs";
const ISSUED = readFileSync(new URL("../../admin-tokens.local.txt", import.meta.url), "utf8")
  .split("\n").filter(l => l && !l.startsWith("#")).map(l => l.split("\t"));
const TOKENS = Object.fromEntries(ISSUED.map(([email, role, token]) => [role, token]));
const SUPER_EMAIL = ISSUED.find(([, role]) => role === "super")?.[0];
const SUPER = { authorization: `Bearer ${TOKENS.super}` }, ADMIN = { authorization: `Bearer ${TOKENS.admin}` };
const jars = {};
async function call(who, path, body, headers = {}) {
  const res = await fetch(B + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", cookie: [PASS, jars[who]].filter(Boolean).join("; "), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) jars[who] = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, set };
}
let fails = 0;
const check = (label, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`); if (!ok) fails++; };

// Participants-only gate: personal access tokens, sent by Slack DM. The super
// admin generates them; the server keeps only their hashes. This generates a
// batch, so the local app is closed afterwards too (enter a token from /console's CSV).
const ORIGIN = new URL(B).origin;
const post = (path, body, headers) => fetch(B + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const opensApp = pass => fetch(ORIGIN + "/", { headers: { cookie: pass } }).then(x => x.status === 200);
const enter = async token => {
  const res = await post("/access", { token });
  return { res, pass: (res.headers.get("set-cookie") || "").split(";")[0], set: res.headers.get("set-cookie") || "" };
};
check("an admin cannot generate tokens", (await post("/admin", { generate_invites: 3 }, ADMIN)).status === 403);
check("a batch over 500 is refused", (await post("/admin", { generate_invites: 501 }, SUPER)).status === 400);
let gr = await post("/admin", { generate_invites: 3 }, SUPER);
const G = await gr.json();
const [t1, t2, t3] = G.invites || [];
check("the super admin generates tokens", gr.status === 201 && G.invites?.length === 3, JSON.stringify(G).slice(0, 100));
check("tokens are 24 characters in groups of four", /^([2-9A-HJ-NP-Z]{4}-){5}[2-9A-HJ-NP-Z]{4}$/.test(t1?.token || ""), t1?.token);
check("tokens are distinct", new Set([t1, t2, t3].map(t => t?.token)).size === 3);
check("each token comes with its link", t1?.link === `${ORIGIN}/?t=${t1?.token}`, t1?.link);
const stats = await (await fetch(B + "/admin?invites", { headers: ADMIN })).json();
check("any admin sees the counts, never the tokens", stats.total >= 3 && !JSON.stringify(stats).includes(t1.token), JSON.stringify(stats));
check("without a token, the app is closed", (await fetch(ORIGIN + "/")).status === 403);
check("the locked page asks for the token", /name="token"/.test(await (await fetch(ORIGIN + "/")).text()));
check("without a token, data.json is closed", (await fetch(ORIGIN + "/data.json")).status === 403);
check("without a token, the API is closed", (await fetch(B + "/me")).status === 403);
check("the privacy notice stays open", (await fetch(ORIGIN + "/privacy.html")).status === 200);
check("a wrong token is refused", (await enter("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF")).res.status === 403);
check("a short token is refused", (await enter("ABC")).res.status === 403);
let { res, pass: PASS, set } = await enter(t1.token);
check("a token sets an HttpOnly pass", res.status === 200 && /^cwj_pass=/.test(PASS) && /HttpOnly/.test(set));
check("the pass opens the app", await opensApp(PASS));
check("tokens are read in any case, without hyphens", (await enter(t2.token.toLowerCase().replace(/-/g, " "))).res.status === 200);
check("a whole pasted link is read as its token", (await enter(` ${t2.link} `)).res.status === 200);
check("1 and I are read as L", !/L/.test(t2.token) || (await enter(t2.token.replace(/L/g, "1"))).res.status === 200);
const fresh = (await (await post("/admin", { generate_invites: 1 }, SUPER)).json()).invites[0];
check("a token works the moment it is generated", (await enter(fresh.token)).res.status === 200);
res = await fetch(`${ORIGIN}/?t=${t3.token}#platforms`, { redirect: "manual" });
const linkPass = (res.headers.get("set-cookie") || "").split(";")[0];
check("the token's link sets a pass and drops the token from the address", res.status === 302 && res.headers.get("location") === "/?new" && await opensApp(linkPass), res.headers.get("location"));
res = await fetch(ORIGIN + "/api/access", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `token=${encodeURIComponent(t2.token)}`, redirect: "manual" });
check("the locked page's form works", res.status === 303 && res.headers.get("location") === "/");
check("revoking needs the super admin", (await post("/admin", { revoke_invite: t3.id }, ADMIN)).status === 403);
check("revoke a token", (await post("/admin", { revoke_invite: t3.id }, SUPER)).status === 200);
check("revoking it twice says so", (await post("/admin", { revoke_invite: t3.id }, SUPER)).status === 404);
check("a revoked token is refused", (await enter(t3.token)).res.status === 403);
await new Promise(r => setTimeout(r, 16000));  // the gate caches revocations for 15 seconds
check("a revoked token's pass is refused", !await opensApp(linkPass));
check("other passes still work", await opensApp(PASS));
const after = await (await fetch(B + "/admin?invites", { headers: SUPER })).json();
check("counts used and revoked tokens", after.used >= 3 && after.revoked >= 1, JSON.stringify(after));


// Participants: the access token is the identity. No name, affiliation or contact.
const T = (await (await post("/admin", { generate_invites: 6 }, SUPER)).json()).invites;
async function signIn(who, token) {
  const res = await post("/access", { token });
  const cookies = res.headers.getSetCookie();
  jars[who] = cookies.map(c => c.split(";")[0]).join("; ");
  return { status: res.status, data: await res.json().catch(() => ({})), cookies };
}
let r = await call("x", "/notes", { item_id: 269094, topic: "platforms", kind: "comment", relation: "happened", point: "hello there" });
check("a pass alone cannot post a note", r.status === 401, r.data.error);
r = await signIn("a", T[0].token);
const adaPseudo = r.data.participant?.pseudo;
check("a token signs in a new participant with a themed pseudonym", r.status === 200 && r.data.returning === false && /^[A-Z][\w-]+ [A-Z]\w+$/.test(adaPseudo || ""), adaPseudo);
check("sign-in sets an HttpOnly session and pass", r.cookies.length === 2 && r.cookies.every(c => /HttpOnly/.test(c))
  && r.cookies.some(c => c.startsWith("cwj_session=")) && r.cookies.some(c => c.startsWith("cwj_pass=")));
check("nothing personal is returned", Object.keys(r.data.participant || {}).join() === "pseudo", JSON.stringify(r.data.participant));
r = await call("a", "/me");
check("me knows who is signed in", r.data.participant?.pseudo === adaPseudo);
r = await signIn("a2", T[0].token.toLowerCase());
check("the same token on another device is the same person", r.data.returning === true && r.data.participant?.pseudo === adaPseudo);
res = await fetch(`${ORIGIN}/?t=${T[5].token}`, { redirect: "manual" });
check("a first sign-in by link lands with ?new", res.status === 302 && res.headers.get("location") === "/?new", res.headers.get("location"));
res = await fetch(`${ORIGIN}/?t=${T[5].token}`, { redirect: "manual" });
check("a returning sign-in by link lands without it", res.headers.get("location") === "/", res.headers.get("location"));
check("the old sign-up with name and email is gone", (await call("x", "/join", { name: "Ada Test", affiliation: "UNIGE", contact: "ada@example.org" })).status !== 200);
r = await call("a", "/notes", { item_id: 269094, topic: "platforms", kind: "criticism", relation: "happened",
  point: "MTurk already lost to AI annotation", why: "Budgets moved to LLM labeling", evidence: "The panel cites the sunset date", horizon_months: 0, horizon_note: "It is here" });
check("post a three-part note, already happened", r.status === 201 && r.data.note.horizon_months === 0, r.data.error || "");
r = await call("x", "/notes?topic=platforms");
check("notes are for signed-in participants only", r.status === 401, r.data.error);
r = await call("a2", "/notes?topic=platforms");
const n = r.data.notes?.[0] || {};
check("notes show the pseudonym only", n.author === adaPseudo && !("participant_id" in n));
check("notes never expose a token", !JSON.stringify(r.data).includes(T[0].token));
check("summary counts 'already happened'", r.data.summary?.horizon?.["0"] === 1);
check("parts stored separately", n.point && n.why && n.evidence);
r = await signIn("b", T[1].token);
const boPseudo = r.data.participant?.pseudo;
check("each token is its own participant", !!boPseudo && boPseudo !== adaPseudo);
const timing = h => call("b", "/notes", { item_id: 269094, topic: "platforms", kind: "comment", relation: "still_open", point: `Timing ${h}`, horizon_months: h });
r = await timing(61);
check("timing accepts 'more than 5 years'", r.status === 201 && r.data.note.horizon_months === 61, r.data.error || "");
r = await timing(999);
check("timing accepts 'never'", r.status === 201 && r.data.note.horizon_months === 999, r.data.error || "");
r = await timing(100);
check("timing refuses other values", r.status === 400, r.data.error);
r = await call("b", "/notes?topic=platforms");
check("summary counts 'more than 5 years' and 'never'", r.data.summary?.horizon?.["61"] === 1 && r.data.summary?.horizon?.["999"] === 1);
// Changing the pseudonym
r = await call("nobody", `/pseudo?check=Wise%20Heron`);
check("pseudonym check needs sign-in", r.status === 401);
const free = async name => (await call("a", `/pseudo?check=${encodeURIComponent(name)}`)).data;
check("someone else's pseudonym is taken", (await free(boPseudo)).available === false);
check("a look-alike of it is taken too", (await free(boPseudo.toLowerCase().replace(/ /g, "-"))).available === false, boPseudo.toLowerCase().replace(/ /g, "-"));
check("your own pseudonym in other case is free", (await free(adaPseudo.toUpperCase())).available === true);
check("'Anonymous' is kept", (await free("Anonymous")).available === false);
check("symbols only are refused", (await free("!!")).available === false);
const newPseudo = `Quiet Heron ${Date.now() % 100000}`;
check("a new name is free", (await free(newPseudo)).available === true);
r = await call("a", "/pseudo", { pseudo: `  ${newPseudo} ` });
check("change the pseudonym", r.status === 200 && r.data.participant.pseudo === newPseudo, r.data.error || r.data.participant?.pseudo);
r = await call("a", "/me");
check("me shows the new pseudonym", r.data.participant?.pseudo === newPseudo);
r = await call("a", "/notes?topic=platforms");
check("earlier notes show the new pseudonym", r.data.notes?.find(x => x.point.startsWith("MTurk"))?.author === newPseudo);
r = await call("a", "/pseudo", { pseudo: boPseudo });
check("taking someone else's pseudonym is refused", r.status === 409, r.data.error);
r = await call("a", "/pseudo?draw=1");
check("draw suggests a free themed name", !!r.data.pseudo && (await free(r.data.pseudo)).available === true, r.data.pseudo);

// Signing out, and back in with the token
r = await call("a2", "/logout", {});
check("sign-out clears the session and the pass", r.status === 200 && /cwj_session=;/.test(r.set || "") && /cwj_pass=;/.test(r.set || ""), r.set);
r = await signIn("a3", T[0].token);
check("the token signs back in, with the changed pseudonym", r.data.returning === true && r.data.participant?.pseudo === newPseudo);

r = await call("a", "/erase", { confirm: "someone" });
check("erase needs the right pseudonym", r.status === 400);
r = await call("a", "/erase", { confirm: newPseudo.toLowerCase() });
check("erase with own pseudonym", r.status === 200 && r.data.notes_kept === 1, r.data.error || "");
r = await call("b", "/notes?topic=platforms");
const erasedNote = r.data.notes?.find(x => x.point.startsWith("MTurk")) || {};
check("erased note shows as anonymous", erasedNote.author === null);
r = await call("a", "/me");
check("erased person is signed out", r.data.participant === null);
r = await signIn("a4", T[0].token);
check("after erasure the token starts a new participant", r.status === 200 && r.data.returning === false && r.data.participant?.pseudo !== newPseudo);
const bypass = (await fetch(B + "/dev/login", { redirect: "manual" })).status !== 404;
r = await call("x", "/admin?table=participants");
if (bypass) console.log("SKIP  admin export needs the token  (DEV_BYPASS is on)");
else check("admin export needs the token", r.status === 403);
r = await call("x", "/admin?table=participants", null, SUPER);
check("participants export has token numbers and nothing personal", typeof r.data === "string" && r.data.includes("token_number")
  && !/contact|affiliation|follow_up|country/.test(r.data.split("\r\n")[0]), r.data.split("\r\n")[0]);

// Feedback on the app: admins only
r = await call("nobody", "/feedback");
check("feedback refuses visitors", r.status === 403);
r = await call("x", "/feedback", { kind: "idea", body: "A participant trying to post" });
check("feedback refuses signed-in participants", r.status === 403);
const fbText = `Smoke test idea ${Date.now()}`;
r = await call("x", "/feedback", { kind: "idea", body: fbText, page: "#platforms", viewport: "390x844" }, SUPER);
const fid = r.data.items?.find(i => i.body === fbText)?.id;
check("an admin token can post feedback", r.status === 201 && !!fid, r.data.error || "");
check("feedback is signed with the admin's email", r.data.items?.find(i => i.id === fid)?.author === SUPER_EMAIL);
r = await call("x", "/feedback", { kind: "idea", body: "ok" }, SUPER);
check("feedback needs a few words", r.status === 400);
r = await call("x", "/feedback", { vote: fid }, ADMIN);
check("+1 from another admin", r.data.items.find(i => i.id === fid)?.votes === 1 && r.data.items.find(i => i.id === fid)?.mine === true);
r = await call("x", "/feedback", { vote: fid }, ADMIN);
check("+1 toggles off", r.data.items.find(i => i.id === fid)?.votes === 0);
r = await call("x", "/admin", { feedback_id: fid, status: "planned" }, SUPER);
check("admin sets status", r.status === 204);
r = await call("x", "/feedback", null, ADMIN);
check("status shows to all admins", r.data.items.find(i => i.id === fid)?.status === "planned");
r = await call("x", "/admin?table=feedback", null, SUPER);
check("admin feedback export", typeof r.data === "string" && r.data.includes("390x844"));

// Admin cookie: the console signs a browser in for the app's feedback box
r = await call("adm", "/admin", { login: true }, ADMIN);
check("console login sets an admin cookie", r.status === 200 && /cwj_admin=/.test(r.set || "") && /HttpOnly/.test(r.set || ""));
jars.adm = (r.set || "").split(";")[0];
r = await call("adm", "/me");
check("the app sees the admin", r.data.admin?.role === "admin");
r = await call("adm", "/feedback");
check("the cookie opens the feedback box", r.status === 200 && Array.isArray(r.data.items));
r = await call("x", "/me");
check("a participant is not an admin", r.data.admin === null);
r = await call("adm", "/admin", { logout: true });
check("locking the console clears the cookie", r.status === 204 && /cwj_admin=;/.test(r.set || ""));
jars.adm = "";
r = await call("adm", "/feedback");
check("after locking, feedback is closed again", r.status === 403);

// Personal admin tokens and roles
r = await call("x", "/admin?whoami", null, SUPER);
check("super token is recognised", r.data.role === "super" && r.data.via === "token", JSON.stringify(r.data));
r = await call("x", "/admin?whoami", null, ADMIN);
check("admin token is recognised", r.data.role === "admin", r.data.email);
r = await call("x", "/admin?whoami", null, { authorization: "Bearer not-a-real-token" });
check("a wrong token is refused", r.status === 403);
r = await call("x", "/admin?table=participants&format=json", null, ADMIN);
check("admins see pseudonyms and token numbers only", r.data.rows.length > 0
  && r.data.rows.every(p => !("contact" in p) && !("name" in p) && !("affiliation" in p) && "token_number" in p));
r = await call("x", "/admin", { feedback_id: fid, status: "done" }, ADMIN);
check("an admin (not only super) can set feedback status", r.status === 204);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
