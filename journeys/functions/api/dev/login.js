// GET /api/dev/login?next=%23platforms
// Local development only: signs in as "Demo Visitor" and opens the page in `next`.
// Returns 404 unless DEV_BYPASS=1 and the request is to localhost (see devBypass).
import { devBypass, requireSecret, signSession, cookieHeader } from "../_lib.js";
import { freshPseudo } from "../_pseudos.js";

const DEMO = { contact: "demo@localhost.test", name: "Demo Visitor", affiliation: "CrowdCamp (local test)" };

export async function onRequestGet({ request, env }) {
  if (!devBypass(request, env)) return new Response("Not found.", { status: 404 });
  let p = await env.DB.prepare("SELECT id FROM participant WHERE contact = ?1").bind(DEMO.contact).first();
  if (!p) {
    p = { id: crypto.randomUUID() };
    await env.DB.prepare(
      "INSERT INTO participant (id, name, affiliation, contact, contact_kind, last_seen_at, pseudo) VALUES (?1, ?2, ?3, ?4, 'email', ?5, ?6)"
    ).bind(p.id, DEMO.name, DEMO.affiliation, DEMO.contact, new Date().toISOString(), await freshPseudo(env.DB)).run();
  }
  const next = new URL(request.url).searchParams.get("next") || "";
  const target = /^#[a-z_]*$/.test(next) ? next : "";
  const token = await signSession({ pid: p.id }, requireSecret(request, env));
  return new Response(null, { status: 302, headers: { Location: `/${target}`, "Set-Cookie": cookieHeader(request, token) } });
}
