// Smoke test for the local API: node build/tests/api-smoke.mjs [base]
const B = (process.argv[2] || "http://127.0.0.1:8792") + "/api";
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
check("cookie is HttpOnly", /HttpOnly/.test(r.set || ""));
r = await call("a", "/me");
check("me knows who is signed in", r.data.participant?.name === "Ada Test");
r = await call("a", "/notes", { item_id: 269094, topic: "platforms", kind: "criticism", relation: "happened",
  point: "MTurk already lost to AI annotation", why: "Budgets moved to LLM labeling", evidence: "The panel cites the sunset date", horizon_months: 0, horizon_note: "It is here" });
check("post a three-part note, already happened", r.status === 201 && r.data.note.horizon_months === 0, r.data.error || "");
r = await call("x", "/notes?topic=platforms");
const n = r.data.notes?.[0] || {};
check("notes show name and affiliation", n.author === "Ada Test" && n.affiliation === "UNIGE");
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
r = await call("x", "/admin?table=participants", null, { authorization: "Bearer local-dev-token" });
check("admin participants export", typeof r.data === "string" && r.data.includes("follow_up") && r.data.includes("+41791234567"));
// Feedback on the app
r = await call("nobody", "/feedback");
check("feedback needs sign-in", r.status === 401);
const fbText = `Smoke test idea ${Date.now()}`;
r = await call("x", "/feedback", { kind: "idea", body: fbText, page: "#platforms", viewport: "390x844" });
const fid = r.data.items?.find(i => i.body === fbText)?.id;
check("post feedback", r.status === 201 && !!fid, r.data.error || "");
r = await call("x", "/feedback", { kind: "idea", body: "ok" });
check("feedback needs a few words", r.status === 400);
r = await call("b", "/feedback", { vote: fid });
check("+1 from a colleague", r.data.items.find(i => i.id === fid)?.votes === 1 && r.data.items.find(i => i.id === fid)?.mine === true);
r = await call("b", "/feedback", { vote: fid });
check("+1 toggles off", r.data.items.find(i => i.id === fid)?.votes === 0);
r = await call("x", "/admin", { feedback_id: fid, status: "planned" }, { authorization: "Bearer local-dev-token" });
check("admin sets status", r.status === 204);
r = await call("x", "/feedback");
check("status shows to everyone", r.data.items.find(i => i.id === fid)?.status === "planned");
r = await call("x", "/admin?table=feedback", null, { authorization: "Bearer local-dev-token" });
check("admin feedback export", typeof r.data === "string" && r.data.includes("390x844"));

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
