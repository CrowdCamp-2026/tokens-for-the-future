// Phone-width screenshots of the splash page and the note form, via Chrome's DevTools protocol.
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const BASE = process.argv[2] || "http://127.0.0.1:8792";
const OUT = new URL("./shots/", import.meta.url).pathname;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--disable-gpu", "--remote-debugging-port=9334", `--user-data-dir=${new URL("./.chrome/", import.meta.url).pathname}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) { try { const t = await (await fetch("http://127.0.0.1:9334/json")).json(); ws = t.find(x => x.type === "page")?.webSocketDebuggerUrl; } catch {} await sleep(250); }
const sock = new WebSocket(ws); await new Promise(r => (sock.onopen = r));
let id = 0; const pending = {};
sock.onmessage = m => { const d = JSON.parse(m.data); pending[d.id]?.(d.result); delete pending[d.id]; };
const send = (method, params = {}) => new Promise(r => { pending[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
const ev = expression => send("Runtime.evaluate", { expression, awaitPromise: true });
const shot = async name => { const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(OUT + name, Buffer.from(s.data, "base64")); };
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 1300, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await send("Network.enable"); await send("Network.clearBrowserCookies");
// The participants-only gate: generate one access token with the super admin token
// from make-admin-tokens.mjs --dev, and first shoot the locked page asking for it.
const tokens = new URL("../../admin-tokens.local.txt", import.meta.url).pathname;
const superToken = existsSync(tokens) ? readFileSync(tokens, "utf8").split("\n").map(l => l.split("\t")).find(l => l[1] === "super")?.[2] : null;
const invite = superToken && (await (await fetch(BASE + "/api/admin", {
  method: "POST", headers: { authorization: `Bearer ${superToken}`, "content-type": "application/json" }, body: JSON.stringify({ generate_invites: 1 }),
})).json().catch(() => ({}))).invites?.[0];
await send("Page.navigate", { url: BASE + "/" }); await sleep(2000);
await shot("0-locked.png");
await send("Page.navigate", { url: invite ? `${BASE}/?t=${invite.token}` : BASE + "/" }); await sleep(3000);
await shot("1-welcome.png");  // signed in by the token link, with the new-pseudonym welcome
await sleep(1500);
await send("Page.navigate", { url: BASE + "/#platforms" }); await sleep(2500);
await ev(`document.querySelector('.day').scrollIntoView(); window.scrollBy(0, -60)`); await sleep(300);
await shot("1b-route.png");
await send("Page.navigate", { url: BASE + "/#governance" }); await sleep(2500);
await ev(`document.querySelector('.slot > div > ul.items [data-note-open]').click()`); await sleep(300);
await ev(`(()=>{const f=document.querySelector('.note-form');
  const k=f.querySelector('input[name=kind][value=question]'); k.checked=true; k.dispatchEvent(new Event('change',{bubbles:true}));
  const p0=f.querySelector('#nf-p0'); p0.value='Who writes the contract when agents negotiate on our behalf?'; p0.dispatchEvent(new Event('input',{bubbles:true}));
  const p1=f.querySelector('#nf-p1'); p1.value='Because the speakers assumed institutions keep up, and they do not.'; p1.dispatchEvent(new Event('input',{bubbles:true}));
  const r=f.querySelector('input[name=relation][value=happened]'); r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true}));
  f.scrollIntoView(); window.scrollBy(0,-20);})()`);
await sleep(500);
await shot("2-note-form.png");
await ev(`location.hash='#feedback'`); await sleep(1200);
await shot("2b-feedback-locked.png");
// An admin opens the console once (?dev locally); the feedback box then appears in the app.
await send("Page.navigate", { url: BASE + "/console?dev" }); await sleep(2500);
await send("Page.navigate", { url: BASE + "/#" }); await sleep(2500);
await shot("3-home-with-feedback-button.png");
await ev(`location.hash='#platforms'`); await sleep(1200);
await ev(`location.hash='#feedback'`); await sleep(1500);
await ev(`(()=>{const f=document.getElementById('fb-form'); f.querySelector('#fb-body').value='The Went to something else link is easy to miss on a phone.'; f.requestSubmit();})()`);
await sleep(1500);
await shot("4-feedback.png");
chrome.kill(); process.exit(0);
