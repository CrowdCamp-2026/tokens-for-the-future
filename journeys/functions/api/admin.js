import { adminIdentity, requireSecret, signSession, adminCookieHeader, clearAdminCookieHeader } from "./_lib.js";

// Organizer-only endpoints. Send your personal token: Authorization: Bearer <token>
// (or come through Cloudflare Access). Roles: "admin" sees everything except
// participants' email and phone; "super" sees those too. See adminIdentity in _lib.js.
// GET  /api/admin?whoami               who you are signed in as
// POST /api/admin {login: true}        set the admin cookie for this browser (used by the app's feedback box)
// POST /api/admin {logout: true}       clear it
// GET  /api/admin                      all notes (hidden ones too) as CSV, with who wrote them
//      add &format=json to any GET for the console at /console.html
// GET  /api/admin?table=participants   everyone who signed in, as CSV
// GET  /api/admin?table=feedback       feedback on the app, with +1 counts
// POST /api/admin {id, hidden}         hide or restore a note
// POST /api/admin {feedback_id, status} set feedback status: open, planned, done, wontfix
const denied = () => new Response("Not allowed.", { status: 403 });



const csvCell = v => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const QUERIES = {
  notes: {
    sql: `SELECT n.id, n.created_at, n.item_id, n.topic, n.kind, n.relation, n.horizon_months, n.horizon_note,
                 n.point, n.why, n.evidence, n.participant_id, p.pseudo, p.name, p.affiliation, n.hidden
            FROM notes n LEFT JOIN participant p ON p.id = n.participant_id ORDER BY n.id`,
    file: "crowdwork-notes.csv",
  },
  participants: {
    // Contacts only for the super admin; enforced here, not only in the console.
    sql: who => `SELECT id, created_at, last_seen_at, pseudo, name, affiliation,${who.role === "super" ? " contact, contact_kind," : ""} follow_up, country, erased_at,
                 (SELECT COUNT(*) FROM notes WHERE participant_id = participant.id) AS notes
            FROM participant ORDER BY created_at`,
    file: "crowdwork-participants.csv",
  },
  feedback: {
    sql: `SELECT f.id, f.created_at, f.kind, f.status, f.body, f.page, f.viewport, f.author_email,
                 (SELECT COUNT(*) FROM feedback_vote v WHERE v.feedback_id = f.id) AS votes, f.hidden
            FROM feedback f ORDER BY votes DESC, f.id`,
    file: "crowdwork-feedback.csv",
  },
};
const STATUSES = ["open", "planned", "done", "wontfix"];

export async function onRequestGet({ request, env }) {
  const who = await adminIdentity(request, env);
  if (!who) return denied();
  const params = new URL(request.url).searchParams;
  if (params.has("whoami")) return new Response(JSON.stringify({ email: who.email, role: who.role, via: who.via }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const q = QUERIES[params.get("table") || "notes"];
  if (!q) return new Response("Unknown table.", { status: 400 });
  const { results } = await env.DB.prepare(typeof q.sql === "function" ? q.sql(who) : q.sql).all();
  if (params.get("format") === "json") {
    return new Response(JSON.stringify({ rows: results }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  const cols = results.length ? Object.keys(results[0]) : [];
  const csv = [cols.join(","), ...results.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=${q.file}`, "cache-control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  if (body.logout) return new Response(null, { status: 204, headers: { "Set-Cookie": clearAdminCookieHeader(request) } });
  const who = await adminIdentity(request, env);
  if (!who) return denied();
  if (body.login) {
    const value = await signSession({ adm: who.email, role: who.role, h: who.h }, requireSecret(request, env));
    return new Response(JSON.stringify({ email: who.email, role: who.role }), {
      headers: { "content-type": "application/json", "cache-control": "no-store", "Set-Cookie": adminCookieHeader(request, value) },
    });
  }
  if (body.feedback_id !== undefined) {
    if (!Number.isInteger(body.feedback_id) || !STATUSES.includes(body.status))
      return new Response(`Send {"feedback_id": <id>, "status": "${STATUSES.join('" | "')}"}.`, { status: 400 });
    await env.DB.prepare(`UPDATE feedback SET status = ?1 WHERE id = ?2`).bind(body.status, body.feedback_id).run();
    return new Response(null, { status: 204 });
  }
  const { id, hidden = true } = body;
  if (!Number.isInteger(id)) return new Response("Send {\"id\": <note id>}.", { status: 400 });
  await env.DB.prepare(`UPDATE notes SET hidden = ?1 WHERE id = ?2`).bind(hidden ? 1 : 0, id).run();
  return new Response(null, { status: 204 });
}
