"""Build flyer (US Letter) and poster (24x36 in) with a QR code to the journeys site, then render PDFs."""
import json, html, pathlib, subprocess, sys
SITE_URL = sys.argv[1] if len(sys.argv) > 1 else "https://crowdwork-journeys.pages.dev"
HERE = pathlib.Path(__file__).parent
TOPICS = json.load(open(HERE.parent / "build" / "topics.json"))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
e = html.escape

def questions():
    out, dim = [], None
    for t in TOPICS:
        if t["dim"] != dim:
            dim = t["dim"]
            out.append(f'<div class="dim{" new" if dim.startswith("New") else ""}">{e(dim)}</div>')
        out.append(f'<div class="q"><span class="n">{t["n"]:02d}</span><div><div class="area">{e(t["name"])}</div><div class="qq">{e(t["question"])}</div></div></div>')
    return "".join(out)

def page(size, scale):
    w, h = size
    shown = SITE_URL.replace("https://", "")
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Crowd Work Journeys</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..800&family=IBM+Plex+Mono:wght@500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..600;1,8..60,400..600&display=block" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<style>
@page {{ size: {w}in {h}in; margin: 0; }}
:root {{ --u: {scale}pt; --ink:#16202B; --muted:#5B6673; --rule:#C9D0D7; --then:#2C4F8E; --now:#A4541A; --tint:#F8EDE4; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; background: #fff; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.sheet {{ width: {w}in; height: {h}in; padding: calc(var(--u)*28) calc(var(--u)*38) calc(var(--u)*20); display: flex; flex-direction: column; gap: calc(var(--u)*10); font-family: "Source Serif 4", Georgia, serif; }}
.eyebrow {{ display:flex; justify-content:space-between; font: 600 calc(var(--u)*8.5)/1 "IBM Plex Mono", monospace; letter-spacing:.12em; text-transform:uppercase; color: var(--muted); border-bottom: calc(var(--u)*1.3) solid var(--ink); padding-bottom: calc(var(--u)*6); }}
h1 {{ margin: calc(var(--u)*4) 0 0; font: 800 calc(var(--u)*34)/.98 "Archivo", Arial, sans-serif; font-stretch: 112%; letter-spacing: -.015em; text-wrap: balance; }}
.lede {{ margin: 0; font-size: calc(var(--u)*11); line-height: 1.36; max-width: 36em; }}
.lede em {{ color: var(--then); }}
.hook {{ background: var(--tint); border-radius: calc(var(--u)*5); padding: calc(var(--u)*7) calc(var(--u)*10); font: 500 calc(var(--u)*10.5)/1.35 "Archivo", Arial, sans-serif; }}
.hook b {{ color: var(--now); }}
.qs {{ flex: 1; columns: 2; column-gap: calc(var(--u)*22); column-fill: balance; }}
.dim {{ font: 600 calc(var(--u)*7.5)/1 "IBM Plex Mono", monospace; letter-spacing:.12em; text-transform: uppercase; color: var(--then); margin: calc(var(--u)*6) 0 calc(var(--u)*5); break-after: avoid; }}
.dim:first-child {{ margin-top: 0; }}
.dim.new {{ color: var(--now); }}
.q {{ display: grid; grid-template-columns: calc(var(--u)*18) 1fr; gap: calc(var(--u)*4); padding: calc(var(--u)*4) 0; border-top: calc(var(--u)*.6) solid var(--rule); break-inside: avoid; }}
.n {{ font: 600 calc(var(--u)*8.5)/1.5 "IBM Plex Mono", monospace; color: var(--muted); }}
.area {{ font: 600 calc(var(--u)*7.5)/1.2 "IBM Plex Mono", monospace; letter-spacing:.06em; text-transform: uppercase; color: var(--muted); margin-bottom: calc(var(--u)*2); }}
.qq {{ font: 600 calc(var(--u)*10.5)/1.28 "Archivo", Arial, sans-serif; }}
.cta {{ display: grid; grid-template-columns: auto 1fr; gap: calc(var(--u)*16); align-items: center; border-top: calc(var(--u)*1.3) solid var(--ink); padding-top: calc(var(--u)*10); }}
#qr svg {{ width: calc(var(--u)*104); height: calc(var(--u)*104); display: block; }}
.cta h2 {{ margin: 0; font: 800 calc(var(--u)*20)/1.02 "Archivo", Arial, sans-serif; font-stretch: 110%; }}
.steps {{ margin: calc(var(--u)*6) 0 0; padding-left: calc(var(--u)*14); font-size: calc(var(--u)*10.5); line-height: 1.4; }}
.url {{ margin-top: calc(var(--u)*6); font: 600 calc(var(--u)*10)/1 "IBM Plex Mono", monospace; color: var(--then); }}
.foot {{ font: 500 calc(var(--u)*7)/1.3 "IBM Plex Mono", monospace; color: var(--muted); letter-spacing: .04em; }}
</style></head><body><section class="sheet">
<div class="eyebrow"><span>CrowdCamp 2026 · HCOMP + CI · Alexandria, VA</span><span>Sep 28–30</span></div>
<h1>13 questions for the future of crowd work</h1>
<p class="lede">In 2013, a paper born at CrowdCamp asked: <em>“Can we foresee a future crowd workplace in which we would want our children to participate?”</em> It mapped twelve research areas. AI has since changed most of them. Here is the question we would ask about each one today, plus a thirteenth the paper left out.</p>
<div class="hook"><b>Why now:</b> Amazon Mechanical Turk shuts down on September 30, 2026, the last day of this conference.</div>
<div class="qs">{questions()}</div>
<div class="cta"><div id="qr" aria-label="QR code to {e(SITE_URL)}"></div><div>
<h2>Pick one. Get your route.</h2>
<ol class="steps"><li>Scan the code and choose the question you care about.</li><li>Get the sessions, talks and posters that match it, Monday to Wednesday.</li><li>Ask your question in Q&amp;A, then leave a comment, question or criticism on the talk, and say when you think you will live in that future.</li></ol>
<div class="url">{e(shown)}</div></div></div>
<div class="foot">After Kittur et al., The Future of Crowd Work, CSCW 2013 · Schedule data: programs.sigchi.org/ci/2026</div>
</section>
<script>const q = qrcode(0, "M"); q.addData({json.dumps(SITE_URL)}); q.make(); document.getElementById("qr").innerHTML = q.createSvgTag({{ scalable: true, margin: 0 }});</script>
</body></html>'''

for name, size, scale in [("flyer", (8.5, 11), 1.0), ("poster", (24, 36), 2.82)]:
    src = HERE / f"{name}.html"
    src.write_text(page(size, scale))
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=8000",
                    f"--print-to-pdf={HERE / (name + '.pdf')}", src.as_uri()], check=True, capture_output=True)
    print(f"{name}.pdf -> QR {SITE_URL}")
