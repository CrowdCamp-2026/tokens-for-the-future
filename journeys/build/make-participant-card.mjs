// A Slack card with the participant link's QR code.
//
//   node build/make-participant-card.mjs "https://crowdwork-journeys.pages.dev/?k=…"
//
// The link comes from the console (/console → Participant link → Copy link), where a
// super admin also resets it. This writes participant-card.local.png (1200×630, for
// Slack) and participant-qr.local.svg (the bare code, for slides or print). Both are
// git-ignored because they carry the key. The console downloads a plain QR code too;
// this adds the title and the "participants only" line around it.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

const link = process.argv[2] || "";
if (!/^https?:\/\/[^/\s]+\/\?k=[\w-]{20,}$/.test(link)) {
  console.error('Usage: node build/make-participant-card.mjs "https://<site>/?k=<key>"  (copy it from the console)');
  process.exit(1);
}
const root = new URL("..", import.meta.url).pathname;

// The QR code, drawn with the console's copy of qrcode-generator, then
// photographed into a card by headless Chrome.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const tmp = mkdtempSync(join(tmpdir(), "cwj-qr-"));
try {
  const sandbox = {};
  runInNewContext(readFileSync(root + "site/vendor/qrcode.min.js", "utf8"), sandbox);
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
  <h1>Tokens of the Future</h1>
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
  copyFileSync(png, root + "participant-card.local.png");
} catch (e) {
  console.error(`Could not draw the QR code (${e.message}). `);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log("Wrote participant-card.local.png (for Slack) and participant-qr.local.svg (bare QR code).");
