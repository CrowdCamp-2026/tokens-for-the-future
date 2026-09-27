// Phone-width screenshot of one page, optionally after clicking an element.
//   node build/tests/page-shot.mjs <path> <out.png> [css selector to click]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [,, path, out, click] = process.argv;
const BASE = "http://127.0.0.1:8792";
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--disable-gpu", "--remote-debugging-port=9338", `--user-data-dir=${new URL("./.chrome/", import.meta.url).pathname}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) { try { ws = (await (await fetch("http://127.0.0.1:9338/json")).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch {} await sleep(250); }
const sock = new WebSocket(ws); await new Promise(r => (sock.onopen = r));
let id = 0; const pending = {};
sock.onmessage = m => { const d = JSON.parse(m.data); pending[d.id]?.(d.result); delete pending[d.id]; };
const send = (method, params = {}) => new Promise(r => { pending[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 1100, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: BASE + path }); await sleep(3500);
if (click) { await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(click)})?.click()` }); await sleep(700); }
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(s.data, "base64"));
chrome.kill(); process.exit(0);
