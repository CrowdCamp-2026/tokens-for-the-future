// Screenshot a reference page and dump computed styles of its main elements.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [,, url, out, width = "1280"] = process.argv;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--disable-gpu", "--remote-debugging-port=9336", `--user-data-dir=${new URL("./.chrome-ref/", import.meta.url).pathname}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) { try { ws = (await (await fetch("http://127.0.0.1:9336/json")).json()).find(x => x.type === "page")?.webSocketDebuggerUrl; } catch {} await sleep(250); }
console.error("ws", ws); const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = e => j(new Error("ws error " + e.message)); }); sock.onclose = e => console.error("ws closed", e.code, e.reason);
let id = 0; const pending = {};
sock.onmessage = m => { const d = JSON.parse(m.data); pending[d.id]?.(d.result); delete pending[d.id]; };
const send = (method, params = {}) => new Promise(r => { pending[++id] = r; sock.send(JSON.stringify({ id, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: +width, height: 1100, deviceScaleFactor: 1, mobile: +width < 600 });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await send("Page.navigate", { url }); await sleep(9000);
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(s.data, "base64"));
const r = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
  const pick = el => { if (!el) return null; const c = getComputedStyle(el); return { tag: el.tagName, cls: String(el.className).slice(0,80), text: (el.innerText||'').trim().slice(0,60), font: c.fontFamily, size: c.fontSize, weight: c.fontWeight, color: c.color, bg: c.backgroundColor, radius: c.borderRadius, border: c.border, shadow: c.boxShadow, pad: c.padding }; };
  const q = s => [...document.querySelectorAll(s)].slice(0,3).map(pick);
  const root = getComputedStyle(document.documentElement);
  const vars = {}; for (const n of ['--font-brand','--font-plain','--primary','--color-primary','--conference-color','--brand-color','--mat-sys-primary','--mat-sys-surface','--mat-sys-on-surface','--mat-app-background-color']) vars[n] = root.getPropertyValue(n).trim();
  const colors = {}; document.querySelectorAll('*').forEach(el => { const c = getComputedStyle(el); for (const k of ['color','backgroundColor','borderTopColor']) { const v = c[k]; if (v && v !== 'rgba(0, 0, 0, 0)') colors[v] = (colors[v]||0)+1; } });
  const fonts = {}; document.querySelectorAll('*').forEach(el => { const f = getComputedStyle(el).fontFamily; fonts[f] = (fonts[f]||0)+1; });
  const links = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href);
  return { vars, body: pick(document.body), header: q('header, mat-toolbar, .toolbar, [class*=header]'), h: q('h1, h2, h3'), cards: q('mat-card, [class*=card], [class*=session]'), chips: q('mat-chip, [class*=chip], [class*=badge], [class*=tag]'), buttons: q('button'), links,
    topColors: Object.entries(colors).sort((a,b)=>b[1]-a[1]).slice(0,14), topFonts: Object.entries(fonts).sort((a,b)=>b[1]-a[1]).slice(0,5) };
})()` });
writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify(r.result.value, null, 1));
chrome.kill(); process.exit(0);
