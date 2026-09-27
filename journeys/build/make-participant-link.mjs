// Generate the participant key, the link to share in the conference Slack, and its QR code.
//
//   node build/make-participant-link.mjs [https://crowdwork-journeys.pages.dev]
//   node build/make-participant-link.mjs --dev     (local: writes .dev.vars, no QR code)
//
// The key is 12 random bytes. It lives only in the link, which is written to
// participant-link.local.txt with a ready-to-paste Slack message, and in the QR
// code: participant-qr.local.png (a card for Slack) and participant-qr.local.svg
// (the bare code, for slides or print). All three are git-ignored. The server
// gets only the SHA-256 of the key, as the PARTICIPANT_KEY_HASH secret:
//
//   npx wrangler pages secret put PARTICIPANT_KEY_HASH --project-name crowdwork-journeys < participant-key.secret.txt
//
// Run it again to rotate: the old link and QR code stop working once the new
// secret is set. People already signed in stay signed in.
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import { join } from "node:path";

const args = process.argv.slice(2);
const dev = args.includes("--dev");
const base = (args.find(a => !a.startsWith("--")) || (dev ? "http://127.0.0.1:8792" : "https://crowdwork-journeys.pages.dev")).replace(/\/+$/, "");
if (!/^https?:\/\/[^/\s]+$/.test(base)) { console.error(`Expected a site origin like https://crowdwork-journeys.pages.dev, got "${base}"`); process.exit(1); }

const root = new URL("..", import.meta.url).pathname;
const key = randomBytes(12).toString("base64url");
const hash = createHash("sha256").update(key).digest("hex");
const link = `${base}/?k=${key}`;

if (dev) {
  const path = root + ".dev.vars";
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(l => l && !l.startsWith("PARTICIPANT_KEY_HASH=")) : [];
  lines.push(`PARTICIPANT_KEY_HASH=${hash}`);
  writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
  writeFileSync(root + "participant-link.dev.txt", link + "\n", { mode: 0o600 });
  console.log(`Wrote PARTICIPANT_KEY_HASH to .dev.vars and the link to participant-link.dev.txt. Restart the local server.\n  ${link}`);
  process.exit(0);
}

const slack = `*Crowd Work Journeys* — pick one of 13 questions about the future of crowd work and get your route through HCOMP + CI 2026 (talks, posters and panels that match it). You can also leave notes on talks, signed with a pseudonym.

For conference participants only: please keep this link inside the conference Slack.
${link}`;
writeFileSync(root + "participant-link.local.txt", [
  `# Crowd Work Journeys participant link, generated ${new Date().toISOString()}`,
  "# Share it only in the conference Slack. Anyone with it can open the app.",
  "",
  link,
  "",
  "# Slack message:",
  "",
  slack,
  "",
].join("\n"), { mode: 0o600 });
writeFileSync(root + "participant-key.secret.txt", hash, { mode: 0o600 });

// The QR code, drawn with qrcode-generator (the library the flyer and poster use),
// then photographed into a card by headless Chrome.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const tmp = mkdtempSync(join(tmpdir(), "cwj-qr-"));
try {
  const sandbox = {};
  runInNewContext(await (await fetch(LIB)).text(), sandbox);
  const q = sandbox.qrcode(0, "M"); q.addData(link); q.make();
  const svg = q.createSvgTag({ scalable: true, margin: 2 });
  writeFileSync(root + "participant-qr.local.svg", svg.includes("xmlns=") ? svg : svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));
  writeFileSync(join(tmp, "card.html"), `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; background: #fff; font-family: Montserrat, Arial, sans-serif; color: #16202B; }
  .card { box-sizing: border-box; height: 630px; padding: 56px 64px; display: grid; grid-template-columns: 1fr 460px; gap: 56px; align-items: center; border-top: 14px solid #497CFF; }
  .eyebrow { font-weight: 600; font-size: 20px; letter-spacing: .12em; text-transform: uppercase; color: #5B6673; }
  h1 { margin: 18px 0 20px; font-weight: 800; font-size: 60px; line-height: 1.02; }
  p { margin: 0 0 16px; font-size: 26px; line-height: 1.35; font-weight: 500; }
  .only { color: #497CFF; font-weight: 700; }
  .qr svg { width: 460px; height: 460px; display: block; }
</style></head><body><div class="card"><div>
  <div class="eyebrow">HCOMP + CI 2026 · Sep 28–30</div>
  <h1>Crowd Work Journeys</h1>
  <p>Pick a question about the future of crowd work. Get your route through the conference.</p>
  <p class="only">Scan to open. For conference participants only.</p>
</div><div class="qr">${svg}</div></div></body></html>`);
  // Headless Chrome writes the screenshot but does not always exit, so wait for the file and stop it.
  const png = join(tmp, "card.png");
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=5000",
    `--user-data-dir=${join(tmp, "profile")}`, "--window-size=1200,630", "--force-device-scale-factor=2",
    `--screenshot=${png}`, "file://" + join(tmp, "card.html")], { stdio: "ignore" });
  const exited = new Promise(r => chrome.once("exit", r));
  for (let i = 0; i < 120 && !existsSync(png); i++) await Promise.race([exited, new Promise(r => setTimeout(r, 250))]);
  await new Promise(r => setTimeout(r, 500));  // let Chrome finish writing
  chrome.kill();
  await exited;
  if (!existsSync(png)) throw new Error("Chrome wrote no screenshot");
  copyFileSync(png, root + "participant-qr.local.png");
} catch (e) {
  console.error(`Could not draw the QR code (${e.message}). The link is still in participant-link.local.txt.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`Link:    ${link}`);
console.log("Slack:   participant-link.local.txt (link + message), participant-qr.local.png (QR card), participant-qr.local.svg (bare QR)");
console.log("Secret:  participant-key.secret.txt (upload, then delete):");
console.log("  npx wrangler pages secret put PARTICIPANT_KEY_HASH --project-name crowdwork-journeys < participant-key.secret.txt");
