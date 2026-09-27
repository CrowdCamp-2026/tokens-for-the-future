// Smoke test for the local API: node build/tests/api-smoke.mjs [base]
const B = (process.argv[2] || "http://127.0.0.1:8792") + "/api";
// Personal tokens from `node build/make-admin-tokens.mjs --dev ...` (admin-tokens.local.txt).
import { readFileSync } from "node:fs";
const TOKENS = Object.fromEntries(readFileSync(new URL("../../admin-tokens.local.txt", import.meta.url), "utf8")
  .split("\n").filter(l => l && !l.startsWith("#")).map(l => l.split("\t")).map(([email, role, token]) => [role, token]));
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

// Participants-only gate. The key lives in D1; the super admin reads and resets it.
// This creates one if there is none, so the local app is closed afterwards too
// (open it from the link in /console).
const ORIGIN = new URL(B).origin;
const post = (path, body, headers) => fetch(B + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const resetLink = async () => (await (await post("/admin", { reset_participant_link: true }, SUPER)).json()).link;
const openLink = async l => {
  const res = await fetch(l.replace(/^https?:\/\/[^/]+/, ORIGIN) + "#platforms", { redirect: "manual" });
  return { res, set: res.headers.get("set-cookie") || "" };
};
let link = (await (await fetch(B + "/admin?participant_link", { headers: SUPER })).json()).link || await resetLink();
check("the super admin gets the link, with a 43-character key", /\/\?k=[\w-]{43}$/.test(link || ""), link);
check("an admin cannot read the participant link", (await fetch(B + "/admin?participant_link", { headers: ADMIN })).status === 403);
check("an admin cannot reset it", (await post("/admin", { reset_participant_link: true }, ADMIN)).status === 403);
check("without the link, the app is closed", (await fetch(ORIGIN + "/")).status === 403);
check("without the link, data.json is closed", (await fetch(ORIGIN + "/data.json")).status === 403);
check("without the link, the API is closed", (await fetch(B + "/me")).status === 403);
check("the privacy notice stays open", (await fetch(ORIGIN + "/privacy.html")).status === 200);
check("a wrong key is refused", (await fetch(ORIGIN + "/?k=not-the-key", { redirect: "manual" })).status === 403);
let { res, set } = await openLink(link);
let PASS = set.split(";")[0];
check("the link sets an HttpOnly pass", res.status === 302 && /^cwj_pass=/.test(PASS) && /HttpOnly/.test(set));
check("the link drops the key from the address", res.headers.get("location") === "/", res.headers.get("location"));
check("the pass opens the app", (await fetch(ORIGIN + "/", { headers: { cookie: PASS } })).status === 200);
const oldLink = link, oldPass = PASS;
link = await resetLink();
check("a reset gives a new key", link && link !== oldLink);
check("after a reset, the old link is refused", (await openLink(oldLink)).res.status === 403);
check("after a reset, the old pass is refused", (await fetch(ORIGIN + "/", { headers: { cookie: oldPass } })).status === 403);
({ res, set } = await openLink(link));
PASS = set.split(";")[0];
check("the new link opens the app", res.status === 302 && (await fetch(ORIGIN + "/", { headers: { cookie: PASS } })).status === 200);

let r = await call("x", "/notes", { item_id: 269094, topic: "platforms", kind: "comment", relation: "happened", point: "hello there" });
check("note without sign-in is refused", r.status === 401, r.data.error);
r = await call("x", "/join", { name: "A", affiliation: "", contact: "nope" });
check("join validates name", r.status === 400, r.data.error);
r = await call("a", "/join", { name: "Ada Test", affiliation: "UNIGE", contact: " Ada.Test@Example.org ", follow_up: true });
check("join with email", r.status === 200 && r.data.participant.contact === "ada.test@example.org", r.data.participant?.contact);
const adaPseudo = r.data.participant?.pseudo;
check("sign-up assigns a themed pseudonym", /^[A-Z][\w-]+ [A-Z]\w+$/.test(adaPseudo || ""), adaPseudo);
check("cookie is HttpOnly", /HttpOnly/.test(r.set || ""));
r = await call("a", "/me");
check("me knows who is signed in", r.data.participant?.name === "Ada Test" && r.data.participant?.pseudo === adaPseudo);
r = await call("a2", "/join", { name: "Ada Test", affiliation: "UNIGE", contact: "ada.test@example.org" });
check("returning person keeps their pseudonym", r.data.returning === true && r.data.participant.pseudo === adaPseudo);
r = await call("a", "/notes", { item_id: 269094, topic: "platforms", kind: "criticism", relation: "happened",
  point: "MTurk already lost to AI annotation", why: "Budgets moved to LLM labeling", evidence: "The panel cites the sunset date", horizon_months: 0, horizon_note: "It is here" });
check("post a three-part note, already happened", r.status === 201 && r.data.note.horizon_months === 0, r.data.error || "");
r = await call("x", "/notes?topic=platforms");
const n = r.data.notes?.[0] || {};
check("notes show the pseudonym only", n.author === adaPseudo && !("affiliation" in n));
check("notes never expose the name", !JSON.stringify(r.data).includes("Ada Test") && !JSON.stringify(r.data).includes("UNIGE"));
check("notes never expose a contact", !JSON.stringify(r.data).includes("example.org"));
check("summary counts 'already happened'", r.data.summary?.horizon?.["0"] === 1);
check("parts stored separately", n.point && n.why && n.evidence);
r = await call("b", "/join", { name: "Bo", affiliation: "ETH", dial: "41", number: "079 123 45 67" });
const bo = r.data.participant?.contact, boPseudo = r.data.participant?.pseudo;
r = await call("y", "/join", { name: "Bo", affiliation: "ETH", contact: "0041 79 123 45 67" });
check("national and international phone forms are one person", bo === "+41791234567" && r.data.returning === true, `${bo} returning=${r.data.returning}`);
// Changing the pseudonym
r = await call("nobody", `/pseudo?check=Wise%20Heron`);
check("pseudonym check needs sign-in", r.status === 401);
const free = async name => (await call("a", `/pseudo?check=${encodeURIComponent(name)}`)).data;
check("someone else's pseudonym is taken", (await free(boPseudo)).available === false);
check("a look-alike of it is taken too", (await free(boPseudo.toLowerCase().replace(/ /g, "-"))).available === false, boPseudo.toLowerCase().replace(/ /g, "-"));
check("your own pseudonym in other case is free", (await free(adaPseudo.toUpperCase())).available === true);
check("'Anonymous' is kept", (await free("Anonymous")).available === false);
check("your real name is refused", /real name/.test((await free("ada test")).error || ""));
check("symbols only are refused", (await free("!!")).available === false);
const newPseudo = `Quiet Heron ${Date.now() % 100000}`;
check("a new name is free", (await free(newPseudo)).available === true);
r = await call("a", "/pseudo", { pseudo: `  ${newPseudo} ` });
check("change the pseudonym", r.status === 200 && r.data.participant.pseudo === newPseudo, r.data.error || r.data.participant?.pseudo);
r = await call("a", "/me");
check("me shows the new pseudonym", r.data.participant?.pseudo === newPseudo);
r = await call("x", "/notes?topic=platforms");
check("earlier notes show the new pseudonym", r.data.notes?.[0]?.author === newPseudo, r.data.notes?.[0]?.author);
r = await call("a", "/pseudo", { pseudo: boPseudo });
check("taking someone else's pseudonym is refused", r.status === 409, r.data.error);
r = await call("a", "/pseudo?draw=1");
check("draw suggests a free themed name", !!r.data.pseudo && (await free(r.data.pseudo)).available === true, r.data.pseudo);

// Signing back in with only the email or phone
r = await call("a3", "/signin", { contact: " ADA.TEST@example.org" });
check("sign back in by email keeps name and pseudonym", r.status === 200 && r.data.participant.name === "Ada Test" && r.data.participant.pseudo === newPseudo, r.data.error || "");
r = await call("a3", "/me");
check("signed back in on the new device", r.data.participant?.pseudo === newPseudo);
r = await call("b2", "/signin", { dial: "41", number: "079 123 45 67" });
check("sign back in by phone", r.status === 200 && r.data.participant.pseudo === boPseudo, r.data.error || "");
r = await call("z", "/signin", { contact: "nobody-here@example.org" });
check("unknown email is told to sign up", r.status === 404, r.data.error);
r = await call("z", "/signin", { contact: "not an email" });
check("sign-in validates the contact", r.status === 400);

r = await call("a", "/erase", { confirm: "someone" });
check("erase needs the right name", r.status === 400);
r = await call("a", "/erase", { confirm: "ada test" });
check("erase with own name", r.status === 200 && r.data.notes_kept === 1);
r = await call("x", "/notes?topic=platforms");
check("erased note shows as anonymous", r.data.notes[0].author === null && r.data.notes[0].point.startsWith("MTurk"));
r = await call("a", "/me");
check("erased person is signed out", r.data.participant === null);
r = await call("z", "/signin", { contact: "ada.test@example.org" });
check("an erased person cannot sign back in", r.status === 404);
r = await call("x", "/join", { name: "Ada Again", affiliation: "UNIGE", contact: "ada.test@example.org" });
check("same email after erase starts a new record", r.data.returning === false);
const bypass = (await fetch(B + "/dev/login", { redirect: "manual" })).status !== 404;
r = await call("x", "/admin?table=participants");
if (bypass) console.log("SKIP  admin export needs the token  (DEV_BYPASS is on)");
else check("admin export needs the token", r.status === 403);
r = await call("x", "/admin?table=participants", null, SUPER);
check("admin participants export", typeof r.data === "string" && r.data.includes("follow_up") && r.data.includes("+41791234567"));
// Feedback on the app: admins only
r = await call("nobody", "/feedback");
check("feedback refuses visitors", r.status === 403);
r = await call("x", "/feedback", { kind: "idea", body: "A participant trying to post" });
check("feedback refuses signed-in participants", r.status === 403);
const fbText = `Smoke test idea ${Date.now()}`;
r = await call("x", "/feedback", { kind: "idea", body: fbText, page: "#platforms", viewport: "390x844" }, SUPER);
const fid = r.data.items?.find(i => i.body === fbText)?.id;
check("an admin token can post feedback", r.status === 201 && !!fid, r.data.error || "");
check("feedback is signed with the admin's email", r.data.items?.find(i => i.id === fid)?.author === "thomas.maillart@gmail.com");
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
r = await call("x", "/admin?table=participants&format=json", null, SUPER);
check("super admin sees contacts", r.data.rows.some(p => "contact" in p));
r = await call("x", "/admin?table=participants&format=json", null, ADMIN);
check("admin does not see contacts", r.data.rows.length > 0 && r.data.rows.every(p => !("contact" in p) && !("contact_kind" in p)));
r = await call("x", "/admin?table=participants", null, ADMIN);
check("admin's CSV has no contacts", typeof r.data === "string" && !r.data.includes("@") && !r.data.includes("contact"));
r = await call("x", "/admin", { feedback_id: fid, status: "done" }, ADMIN);
check("an admin (not only super) can set feedback status", r.status === 204);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
