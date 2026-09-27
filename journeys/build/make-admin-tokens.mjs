// Generate personal admin tokens.
//
//   node build/make-admin-tokens.mjs super:you@example.org admin:a@example.org admin:b@example.org
//   node build/make-admin-tokens.mjs --dev super:you@example.org ...   (writes .dev.vars instead)
//
// Each token is 32 random bytes. It is written ONCE to admin-tokens.local.txt
// (git-ignored) for you to hand to each person, and never stored anywhere else.
// The server gets only the SHA-256 of each token, as the ADMIN_TOKENS secret:
//
//   npx wrangler pages secret put ADMIN_TOKENS --project-name crowdwork-journeys < admin-tokens.secret.json
//
// Run it again to rotate: every old token stops working once the new secret is set.
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const dev = args.includes("--dev");
const people = args.filter(a => !a.startsWith("--")).map(a => {
  const [role, email] = a.split(":");
  if (!["admin", "super"].includes(role) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) {
    console.error(`Expected role:email with role "admin" or "super", got "${a}"`);
    process.exit(1);
  }
  return { role, email: email.toLowerCase() };
});
if (!people.length) { console.error("Usage: node build/make-admin-tokens.mjs [--dev] super:email admin:email ..."); process.exit(1); }

const root = new URL("..", import.meta.url).pathname;
const issued = people.map(p => ({ ...p, token: randomBytes(32).toString("base64url") }));
const secret = JSON.stringify(issued.map(({ email, role, token }) => ({ email, role, hash: createHash("sha256").update(token).digest("hex") })));

const handout = [
  `# Crowd Work Journeys admin tokens, generated ${new Date().toISOString()}${dev ? " (LOCAL DEV ONLY)" : ""}`,
  "# Give each person only their own line. Delete this file once they have them.",
  "# Open the console, paste the token when asked.",
  "",
  ...issued.map(i => `${i.email}\t${i.role}\t${i.token}`),
  "",
].join("\n");
writeFileSync(root + "admin-tokens.local.txt", handout, { mode: 0o600 });

if (dev) {
  const path = root + ".dev.vars";
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(l => l && !l.startsWith("ADMIN_TOKENS=") && !l.startsWith("ADMIN_TOKEN=")) : [];
  lines.push(`ADMIN_TOKENS=${secret}`);
  writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`Wrote ADMIN_TOKENS to .dev.vars and the tokens to admin-tokens.local.txt. Restart the local server.`);
} else {
  writeFileSync(root + "admin-tokens.secret.json", secret, { mode: 0o600 });
  console.log("Tokens: admin-tokens.local.txt (hand out, then delete)");
  console.log("Secret: admin-tokens.secret.json (upload, then delete):");
  console.log("  npx wrangler pages secret put ADMIN_TOKENS --project-name crowdwork-journeys < admin-tokens.secret.json");
}
