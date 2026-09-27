"""Build site/data.json from the SIGCHI program export, topics.json and tags.json."""
import json, re, html, datetime as dt, pathlib
HERE = pathlib.Path(__file__).parent
SITE = HERE.parent / "site"
P = json.load(open(HERE / "program.json"))
TOPICS = json.load(open(HERE / "topics.json"))
TAGS = {k: v for k, v in json.load(open(HERE / "tags.json")).items() if not k.startswith("_")}
DAYS = {"2026-09-28", "2026-09-29", "2026-09-30"}          # main conference days
SKIP_TYPES = {"Registration", "Break"}

def wall(ms):  # program stores local wall-clock time as UTC
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc)

def clean(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()

ctype = {c["id"]: c["name"] for c in P["contentTypes"]}
color = {c["id"]: c.get("color") for c in P["contentTypes"]}  # the program app colours sessions by type
rooms = {r["id"]: re.sub(r"^Room ", "", r["name"]) for r in P["rooms"]}
people = {p["id"]: f'{p["firstName"]} {p["lastName"]}'.strip() for p in P["people"]}
slots = {t["id"]: t for t in P["timeSlots"]}
contents = {c["id"]: c for c in P["contents"]}

def content(cid):
    c = contents[cid]
    kind = ctype[c["typeId"]]
    kind = {"HCOMP Papers": "Paper", "CI Papers": "Paper", "HCOMP Talks": "Talk", "CI Talks": "Talk",
            "CI Panels": "Panel", "HCOMP Panels": "Panel", "Keynotes": "Keynote"}.get(kind, kind)
    return {"id": cid, "title": clean(c["title"]), "kind": kind,
            "venue": [t for t in c.get("tags", []) if t in ("CI", "HCOMP")],
            "authors": [people.get(a["personId"], "") for a in c.get("authors", [])],
            "abstract": clean(c.get("abstract")), "tags": TAGS.get(str(cid), [])}

blocks = []
for s in P["sessions"]:
    t = slots[s["timeSlotId"]]
    kind = ctype[s["typeId"]]
    if kind in SKIP_TYPES: continue
    blocks.append({"id": s["id"], "name": clean(s["name"]), "kind": kind, "color": color.get(s["typeId"]),
                   "room": rooms.get(s.get("roomId"), ""), "start": wall(t["startDate"]), "end": wall(t["endDate"]),
                   "contents": [content(c) for c in s["contentIds"] if ctype[contents[c]["typeId"]] not in SKIP_TYPES]})
for e in P["events"]:
    blocks.append({"id": e["id"], "name": clean(e["name"]), "kind": "Break" if "Break" in e["name"] else "Event", "color": color.get(e["typeId"]),
                   "room": e.get("location") or "", "start": wall(e["startDate"]), "end": wall(e["endDate"]),
                   "contents": [content(c) for c in e["contentIds"]]})

blocks = [b for b in blocks if b["start"].strftime("%Y-%m-%d") in DAYS]
for b in blocks:
    b["day"] = b["start"].strftime("%Y-%m-%d")
    b["start"], b["end"] = b["start"].strftime("%H:%M"), b["end"].strftime("%H:%M")
blocks.sort(key=lambda b: (b["day"], b["start"], b["name"]))

untagged = [c["title"] for b in blocks for c in b["contents"] if not c["tags"] and c["kind"] != "Event"]
data = {"generated": dt.date.today().isoformat(), "source": "https://programs.sigchi.org/ci/2026",
        "licence": P.get("cc_licence", ""), "topics": TOPICS, "blocks": blocks}
SITE.mkdir(exist_ok=True)
(SITE / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
print(f"{len(blocks)} blocks, {sum(len(b['contents']) for b in blocks)} items -> site/data.json")
for t in TOPICS:
    n = sum(1 for b in blocks for c in b["contents"] if t["key"] in c["tags"])
    print(f'  {t["n"]:>2} {t["name"]:<36} {n} items')
print("untagged:", untagged)
