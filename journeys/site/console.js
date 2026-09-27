// Organizer console: feedback, notes and participants, behind the admin token.
(() => {
  const KEY = "cwj-admin-token";
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = iso => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const RELATION = { happened: "Came true", ai_changed: "AI changed it", still_open: "Still open", unrelated: "Not related" };
  const STATUS = { open: "Open", planned: "Planned", done: "Done", wontfix: "Won’t do" };
  const horizon = m => m === null || m === undefined ? "" : m === 0 ? "Already" : m < 12 ? `${m} mo` : `${m / 12} yr`;

  let token = null, tab = "feedback", role = null, link = null;
  let rows = { feedback: [], notes: [], participants: [] };
  let items = {}, topics = {};

  function getToken() { try { return sessionStorage.getItem(KEY); } catch { return token; } }
  function setToken(v) { token = v; try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* memory only */ } }

  async function admin(query = "", opts = {}) {
    const res = await fetch("/api/admin" + query, {
      ...opts, headers: { ...(token && token !== "dev" ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(opts.headers || {}) },
    });
    if (res.status === 403) { const e = new Error("That token is not valid."); e.locked = true; throw e; }
    if (!res.ok) throw new Error((await res.text()) || "The request failed.");
    return res;
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.textContent = ""; }, 2500);
  }

  // ---------- Loading ----------
  async function loadProgram() {
    if (Object.keys(items).length) return;
    const d = await (await fetch("data.json")).json();
    for (const t of d.topics) topics[t.key] = t.name;
    for (const b of d.blocks) for (const c of b.contents) items[c.id] = { title: c.title, session: b.name, day: b.day };
  }

  async function loadAll() {
    const [f, n, p] = await Promise.all(["feedback", "notes", "participants"].map(t =>
      admin(`?table=${t}&format=json`).then(r => r.json()).then(j => j.rows)));
    rows = { feedback: f, notes: n, participants: p };
    renderStats();
    renderTable();
  }

  async function unlock(v) {
    setToken(v);
    try {
      await Promise.all([loadProgram(), loadAll()]);
      // Also sign this browser in as admin for the app (the feedback box).
      const who = await (await admin("", { method: "POST", body: JSON.stringify({ login: true }) })).json();
      role = who.role;
      await loadLink();
      $("locked").hidden = true;
      $("appbar-who").textContent = `${who.email} · ${who.role === "super" ? "Super admin" : "Admin"}`;
      renderTable();
      $("panel").hidden = false;
    } catch (e) {
      setToken(null);
      $("panel").hidden = true;
      $("locked").hidden = false;
      $("c-lock-err").textContent = e.locked ? e.message : `Could not load the console: ${e.message}`;
    }
  }

  // ---------- Participant link (super admin only) ----------
  async function loadLink() {
    $("c-link").hidden = role !== "super";
    if (role !== "super") return;
    link = await (await admin("?participant_link")).json();
    renderLink();
  }

  function qr() {
    const q = qrcode(0, "M");
    q.addData(link.link); q.make();
    return q;
  }

  function renderLink() {
    const has = !!link?.link;
    $("c-link-qr").innerHTML = has ? qr().createSvgTag({ scalable: true, margin: 2 }) : "";
    $("c-link-qr").hidden = !has;
    $("c-link-url").textContent = has ? link.link : "No link yet. Until you create one, the app is closed to everyone except admins.";
    $("c-link-meta").textContent = has ? `Created ${when(link.created_at)}${link.created_by ? ` by ${link.created_by}` : ""}.` : "";
    for (const id of ["c-link-copy", "c-link-slack", "c-link-png", "c-link-svg"]) $(id).hidden = !has;
    disarm();
  }

  const slackMessage = () => `*Crowd Work Journeys*: pick one of 13 questions about the future of crowd work and get your route through HCOMP + CI 2026 (the talks, posters and panels that match it). You can leave notes on talks, signed with a pseudonym.

For conference participants only: please keep this link inside the conference Slack.
${link.link}`;

  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); } catch { toast("Could not copy. Select the link and copy it by hand."); }
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Resetting takes two clicks, so a stray tap cannot cut everyone off the old link.
  let armed = null;
  function disarm() {
    clearTimeout(armed); armed = null;
    $("c-link-reset").textContent = link?.link ? "Reset link" : "Create link";
  }

  $("c-link-copy").addEventListener("click", () => copy(link.link, "Link copied"));
  $("c-link-slack").addEventListener("click", () => copy(slackMessage(), "Slack message copied"));
  $("c-link-svg").addEventListener("click", () =>
    download(new Blob([qr().createSvgTag({ scalable: true, margin: 2 })], { type: "image/svg+xml" }), "crowdwork-journeys-qr.svg"));
  $("c-link-png").addEventListener("click", () => {
    const q = qr(), n = q.getModuleCount(), cell = 16, margin = 4;
    const c = Object.assign(document.createElement("canvas"), { width: (n + 2 * margin) * cell, height: (n + 2 * margin) * cell });
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) g.fillRect((col + margin) * cell, (r + margin) * cell, cell, cell);
    c.toBlob(b => download(b, "crowdwork-journeys-qr.png"), "image/png");
  });
  $("c-link-reset").addEventListener("click", async () => {
    if (link?.link && !armed) {
      $("c-link-reset").textContent = "Click again: the old link and QR code stop working";
      armed = setTimeout(disarm, 6000);
      return;
    }
    disarm();
    try {
      link = await (await admin("", { method: "POST", body: JSON.stringify({ reset_participant_link: true }) })).json();
      renderLink();
      toast("New link ready. Post it, and its QR code, in the Slack");
    } catch (e) { toast(e.message); }
  });

  // ---------- Rendering ----------
  function renderStats() {
    const people = rows.participants.filter(p => !p.erased_at);
    const stat = (n, label) => `<div><b>${n}</b><span>${label}</span></div>`;
    $("c-stats").innerHTML = [
      stat(people.length, "people signed in"),
      stat(people.filter(p => p.follow_up).length, "agreed to follow-up"),
      stat(rows.notes.filter(n => !n.hidden).length, "notes on talks"),
      stat(rows.feedback.filter(f => f.status === "open" && !f.hidden).length, "open feedback"),
    ].join("");
  }

  const TABLES = {
    feedback: {
      cols: ["+1", "Kind", "Status", "Feedback", "Page", "From", "When"],
      row: f => [
        `<td class="num">${f.votes}</td>`,
        `<td>${esc(f.kind)}</td>`,
        `<td><select data-status="${f.id}" aria-label="Status of feedback ${f.id}">${Object.entries(STATUS).map(([v, l]) => `<option value="${v}"${v === f.status ? " selected" : ""}>${l}</option>`).join("")}</select></td>`,
        `<td class="wide">${esc(f.body)}</td>`,
        `<td>${f.page ? `<a href="./${esc(f.page)}" target="_blank" rel="noopener">${esc(f.page === "#" ? "home" : f.page.slice(1))}</a>` : ""}${f.viewport ? `<div class="sub">${esc(f.viewport)}</div>` : ""}</td>`,
        `<td>${esc(f.name || "Anonymous")}<div class="sub">${esc(f.affiliation || "")}</div></td>`,
        `<td class="nowrap">${esc(when(f.created_at))}</td>`,
      ],
    },
    notes: {
      cols: ["Talk", "Topic", "Kind", "Says", "Lives it", "Note", "By", "When", ""],
      row: n => [
        `<td>${esc(items[n.item_id]?.title || `#${n.item_id}`)}<div class="sub">${esc(items[n.item_id]?.session || "")}</div></td>`,
        `<td>${esc(topics[n.topic] || n.topic)}</td>`,
        `<td>${esc(n.kind)}</td>`,
        `<td>${esc(RELATION[n.relation] || n.relation)}</td>`,
        `<td class="nowrap">${esc(horizon(n.horizon_months))}${n.horizon_note ? `<div class="sub">${esc(n.horizon_note)}</div>` : ""}</td>`,
        `<td class="wide"><b>${esc(n.point)}</b>${n.why ? `<div>Why: ${esc(n.why)}</div>` : ""}${n.evidence ? `<div>From the talk: ${esc(n.evidence)}</div>` : ""}</td>`,
        `<td>${esc(n.pseudo || "Anonymous")}<div class="sub">${esc([n.name, n.affiliation].filter(Boolean).join(", "))}</div></td>`,
        `<td class="nowrap">${esc(when(n.created_at))}</td>`,
        `<td><button class="btn ghost small" type="button" data-hide="${n.id}" data-hidden="${n.hidden ? 1 : 0}">${n.hidden ? "Restore" : "Hide"}</button></td>`,
      ],
      rowClass: n => (n.hidden ? "muted" : ""),
    },
    participants: {
      // The server only sends contacts to the super admin.
      cols: () => ["Pseudonym", "Name", "Affiliation", ...(role === "super" ? ["Contact"] : []), "Follow-up", "Country", "Notes", "Joined", "Last seen"],
      row: p => p.erased_at
        ? [`<td colspan="${role === "super" ? 6 : 5}"><i>Erased ${esc(when(p.erased_at))}</i></td>`, `<td class="num">${p.notes}</td>`, `<td class="nowrap">${esc(when(p.created_at))}</td>`, `<td></td>`]
        : [
          `<td>${esc(p.pseudo || "")}</td>`,
          `<td>${esc(p.name)}</td>`,
          `<td>${esc(p.affiliation)}</td>`,
          ...(role === "super" ? [`<td class="nowrap">${esc(p.contact)}</td>`] : []),
          `<td>${p.follow_up ? "Yes" : "No"}</td>`,
          `<td>${esc(p.country || "")}</td>`,
          `<td class="num">${p.notes}</td>`,
          `<td class="nowrap">${esc(when(p.created_at))}</td>`,
          `<td class="nowrap">${esc(when(p.last_seen_at))}</td>`,
        ],
      rowClass: p => (p.erased_at ? "muted" : ""),
    },
  };

  function renderTable() {
    const def = TABLES[tab];
    const q = $("c-filter").value.trim().toLowerCase();
    const list = rows[tab].filter(r => !q || JSON.stringify(r).toLowerCase().includes(q)
      || (tab === "notes" && (items[r.item_id]?.title || "").toLowerCase().includes(q)));
    const cols = typeof def.cols === "function" ? def.cols() : def.cols;
    const note = tab === "participants" && role !== "super" ? `<p class="fine c-note">Email and phone numbers are visible to the super admin only.</p>` : "";
    $("c-table").innerHTML = note + (list.length
      ? `<table><thead><tr>${cols.map(c => `<th scope="col">${c}</th>`).join("")}</tr></thead>
         <tbody>${list.map(r => `<tr class="${def.rowClass?.(r) || ""}">${def.row(r).join("")}</tr>`).join("")}</tbody></table>
         <p class="fine">${list.length} of ${rows[tab].length} rows</p>`
      : `<p class="pulse-empty">${rows[tab].length ? "No rows match the filter." : "Nothing here yet."}</p>`);
  }

  // ---------- Actions ----------
  $("locked").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("c-token").value.trim();
    if (v) unlock(v);
  });

  document.querySelector(".c-tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll(".c-tabs [data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    renderTable();
  });

  $("c-filter").addEventListener("input", renderTable);
  $("c-refresh").addEventListener("click", () => loadAll().then(() => toast("Refreshed")).catch(e => toast(e.message)));
  $("c-lock").addEventListener("click", () => {
    fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logout: true }) }).catch(() => {});
    setToken(null);
    $("appbar-who").textContent = "";
    rows = { feedback: [], notes: [], participants: [] };
    link = null; role = null;
    $("c-link").hidden = true;
    $("c-table").innerHTML = "";
    $("panel").hidden = true;
    $("locked").hidden = false;
    $("c-token").value = "";
  });

  $("c-csv").addEventListener("click", async () => {
    try {
      const blob = await (await admin(`?table=${tab}`)).blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `crowdwork-${tab}-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast(e.message); }
  });

  $("c-table").addEventListener("change", async e => {
    const sel = e.target.closest("[data-status]");
    if (!sel) return;
    try {
      await admin("", { method: "POST", body: JSON.stringify({ feedback_id: +sel.dataset.status, status: sel.value }) });
      const f = rows.feedback.find(x => x.id === +sel.dataset.status);
      if (f) f.status = sel.value;
      renderStats();
      toast(`Marked ${STATUS[sel.value].toLowerCase()}`);
    } catch (err) { toast(err.message); }
  });

  $("c-table").addEventListener("click", async e => {
    const btn = e.target.closest("[data-hide]");
    if (!btn) return;
    const hide = btn.dataset.hidden !== "1";
    try {
      await admin("", { method: "POST", body: JSON.stringify({ id: +btn.dataset.hide, hidden: hide }) });
      const n = rows.notes.find(x => x.id === +btn.dataset.hide);
      if (n) n.hidden = hide ? 1 : 0;
      renderStats(); renderTable();
      toast(hide ? "Note hidden from the site" : "Note restored");
    } catch (err) { toast(err.message); }
  });

  // /console?dev opens without a token on a local dev server (DEV_BYPASS=1).
  const saved = new URLSearchParams(location.search).has("dev") ? "dev" : getToken();
  if (saved) unlock(saved);
})();
