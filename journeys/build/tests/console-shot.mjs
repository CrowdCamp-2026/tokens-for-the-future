// Desktop screenshot of the organizer console (needs DEV_BYPASS=1 locally).
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const BASE = process.argv[2] || "http://127.0.0.1:8792";
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--disable-gpu", "--remote-debugging-port=9335", `--user-data-dir=${new URL("./.chrome/", import.meta.url).pathname}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) { try { ws = (await (await fetch("http://127.0.0.1:9335/json")).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch {} await sleep(250); }
const sock = new WebSocket(ws); await new Promise(r => (sock.onopen = r));
let id = 0; const pending = {};
sock.onmessage = m => { const d = JSON.parse(m.data); pending[d.id]?.(d.result); delete pending[d.id]; };
const send = (method, params = {}) => new Promise(r => { pending[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
for (const [tab, name] of [["feedback", "5-console-feedback.png"], ["notes", "6-console-notes.png"]]) {
  await send("Page.navigate", { url: BASE + "/console?dev" }); await sleep(2500);
  await send("Runtime.evaluate", { expression: `document.querySelector('[data-tab=${tab}]').click()` }); await sleep(400);
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(new URL(`./shots/${name}`, import.meta.url).pathname, Buffer.from(s.data, "base64"));
}
chrome.kill(); process.exit(0);
