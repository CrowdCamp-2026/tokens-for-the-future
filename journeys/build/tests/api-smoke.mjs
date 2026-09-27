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
    headers: { "content-type": "application/json", ...(jars[who] ? { cookie: jars[who] } : {}), ...headers },
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
const bo = r.data.participant?.contact;
r = await call("y", "/join", { name: "Bo", affiliation: "ETH", contact: "0041 79 123 45 67" });
check("national and international phone forms are one person", bo === "+41791234567" && r.data.returning === true, `${bo} returning=${r.data.returning}`);
r = await call("a", "/erase", { confirm: "someone" });
check("erase needs the right name", r.status === 400);
r = await call("a", "/erase", { confirm: "ada test" });
check("erase with own name", r.status === 200 && r.data.notes_kept === 1);
r = await call("x", "/notes?topic=platforms");
check("erased note shows as anonymous", r.data.notes[0].author === null && r.data.notes[0].point.startsWith("MTurk"));
r = await call("a", "/me");
check("erased person is signed out", r.data.participant === null);
r = await call("x", "/join", { name: "Ada Again", affiliation: "UNIGE", contact: "ada.test@example.org" });
check("same email after erase starts a new record", r.data.returning === false);
const bypass = (await fetch(B + "/dev/login", { redirect: "manual" })).status !== 404;
r = await call("x", "/admin?table=participants");
if (bypass) console.log("SKIP  admin export needs the token  (DEV_BYPASS is on)");
else check("admin export needs the token", r.status === 403);
r = await call("x", "/admin?table=participants", null, SUPER);
check("admin participants export", typeof r.data === "string" && r.data.includes("follow_up") && r.data.includes("+41791234567"));
// Editing your own details
r = await call("ed", "/join", { name: "Edith Test", affiliation: "EPFL", contact: "edith.test@example.org" });
const edPseudo = r.data.participant?.pseudo;
r = await call("nobody", "/me", { name: "X Y", affiliation: "Z", contact: "x@example.org" });
check("editing needs sign-in", r.status === 401);
r = await call("ed", "/me", { name: "Edith Q. Test", affiliation: "ETH Zurich", contact: "edith.test@example.org", follow_up: true });
check("edit name, affiliation and follow-up", r.status === 200 && r.data.participant.name === "Edith Q. Test" && r.data.participant.affiliation === "ETH Zurich" && r.data.participant.follow_up === true);
check("editing keeps the pseudonym", r.data.participant.pseudo === edPseudo);
r = await call("ed", "/me", { name: "Edith Q. Test", affiliation: "ETH Zurich", dial: "41", number: "079 123 45 67" });
check("cannot take someone else's contact", r.status === 409, r.data.error);
r = await call("ed", "/me", { name: "E", affiliation: "ETH Zurich", contact: "edith.new@example.org" });
check("edit validates the name", r.status === 400);
r = await call("ed", "/me", { name: "Edith Q. Test", affiliation: "ETH Zurich", contact: "Edith.New@Example.org" });
check("change email", r.status === 200 && r.data.participant.contact === "edith.new@example.org");
r = await call("ed2", "/join", { name: "Edith Q. Test", affiliation: "ETH Zurich", contact: "edith.new@example.org" });
check("sign in with the new email finds the same person", r.data.returning === true && r.data.participant.pseudo === edPseudo);
r = await call("ed3", "/join", { name: "Edith Old", affiliation: "EPFL", contact: "edith.test@example.org" });
check("the old email no longer leads to the record", r.data.returning === false && r.data.participant.pseudo !== edPseudo);

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
