// Tokens of the Future: sign in, pick a topic, get a route through HCOMP + CI 2026, leave notes on talks.
(() => {
  const app = document.getElementById("app");
  const DAY_NAMES = { "2026-09-28": "Monday", "2026-09-29": "Tuesday", "2026-09-30": "Wednesday" };
  const DAY_SHORT = { "2026-09-28": "Sep 28", "2026-09-29": "Sep 29", "2026-09-30": "Sep 30" };
  const WEIGHTS = [3, 2, 1, 1];
  const STORE = "cwj-stars";
  const KIND = { comment: "Comment", question: "Question", criticism: "Criticism" };
  const RELATION = { happened: "It came true", ai_changed: "AI changed it", still_open: "Still open", unrelated: "Not related" };
  // Months, in order; 0 = already happened, 61 = more than 5 years, 999 = never (as in notes.js).
  const LATER = 61, NEVER = 999;
  const HORIZONS = [0, 6, 12, 18, 24, 36, 48, 60, LATER, NEVER];
  const TICKS = ["Already", "", "1 yr", "", "2 yr", "", "", "5 yr", "", "Never"];  // slider labels, sparse to fit a phone
  const SHORT = ["now", "6m", "1y", "18m", "2y", "3y", "4y", "5y", "5y+", "never"];  // summary chart labels
  const horizonLabel = m => m === 0 ? "Already happened" : m === LATER ? "More than 5 years" : m === NEVER ? "Never"
    : m < 12 ? `${m} months` : m === 12 ? "1 year" : `${m / 12} years`;
  // How a note's timing reads under it, and in the slider's live answer.
  const livesIt = m => m === 0 ? "Already lives it" : m === NEVER ? "Thinks it never comes" : m === LATER ? "Lives it in more than 5 years" : `Lives it in ${horizonLabel(m)}`;
  const sliderSays = m => m === 0 ? "Already happened" : m === NEVER ? "Never" : m === LATER ? "In more than 5 years" : `In about ${horizonLabel(m)}`;

  // The note is written in three parts, each with a sentence opener, and a live
  // word count under it (partitioned text fields + word-count anchor, after
  // Menon, Zhang & Perrault, CHI 2020). Only the first part is required.
  const PARTS = {
    comment:   [["Your point", "Your point is…"], ["Why", "Explain your point…"], ["From the talk", "What in the talk supports it…"]],
    question:  [["Your question", "Your question is…"], ["Why it matters", "It matters because…"], ["From the talk", "What in the talk prompted it…"]],
    criticism: [["What you disagree with", "What you disagree with is…"], ["Why", "Explain why…"], ["Evidence", "Evidence or a counter-example…"]],
  };
  const ANCHOR_WORDS = 120;  // the bar fills here; there is no limit and no instruction to reach it

  let DATA = null, TOPICS = {}, stars = loadStars();
  let API = false, ME = null, ADMIN = null, JUST_JOINED = false;
  let NOTES = { topic: null, ok: false, byItem: new Map(), summary: null };
  let currentKey = null;
  let lastPage = "#";  // where the person was before opening feedback

  function loadStars() { try { return new Set(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch { return new Set(); } }
  function saveStars() { try { localStorage.setItem(STORE, JSON.stringify([...stars])); } catch { /* storage unavailable */ } }

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const score = (item, key) => { const i = item.tags.indexOf(key); return i < 0 ? 0 : WEIGHTS[Math.min(i, 3)]; };
  const matches = (block, key) => block.contents.filter(c => score(c, key) > 0).sort((a, b) => score(b, key) - score(a, key));
  const blockScore = (block, key) => block.contents.reduce((s, c) => s + score(c, key), 0);
  const isPosters = b => /Reception/.test(b.name);
  const isBreak = b => b.kind === "Break";
  const authors = a => a.length === 0 ? "" : a.length <= 3 ? a.join(", ") : `${a.slice(0, 2).join(", ")} and ${a.length - 2} more`;
  const when = iso => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });
  const words = s => (String(s).trim().match(/\S+/g) || []).length;
  const flag = iso => String.fromCodePoint(...[...iso].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: "same-origin", ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(out.error || "Something went wrong. Try again."); e.status = res.status; throw e; }
    return out;
  }

  // Where a question's premise comes from: items in this program (cite in topics.json).
  function citeHTML(cite) {
    if (!cite?.length) return "";
    const one = c => `<i>${esc(c.title)}</i> (${esc(authors(c.authors))}; ${esc(c.kind.toLowerCase())})`;
    return `<p class="cite">Premise from ${cite.map(one).join(" and ")}, in this week’s program.</p>`;
  }

  function slotsByDay() {
    const days = {};
    for (const b of DATA.blocks) ((days[b.day] ||= {})[b.start] ||= []).push(b);
    return days;
  }

  function whoHTML() {
    if (!ME) return "";
    return `<div class="who"><span>Signed in as <b>${esc(ME.pseudo)}</b></span><a href="#me">Your details</a></div>`;
  }

  // ---------- Splash: the access token ----------
  // The locked page (functions/_middleware.js) normally asks for the token and
  // signs the person in. This form is for a browser that still has its pass but
  // no session, for example after signing out.
  function splash(msg = "") {
    currentKey = null;
    fab.hidden = true;
    document.title = "Tokens of the Future";
    app.innerHTML = `
      <div class="eyebrow"><span>CrowdCamp 2026 · at HCOMP + CI, Alexandria, VA</span><span>Sep 28–30</span></div>
      <h1>Tokens of the Future</h1>
      <p class="unofficial">An independent project by CrowdCamp 2026 participants. It is not an official app of HCOMP + CI 2026 or SIGCHI.</p>
      <p class="lede">In 2013, a paper born at CrowdCamp asked: <em>“Can we foresee a future crowd workplace in which we would want our children to participate?”</em> This week, we find out from the inside. You are the crowd: pick a question, follow your route through the conference, and do one small task at each talk you attend, a note on what it says about your question.</p>
      <p class="hook"><b>Why now:</b> Amazon Mechanical Turk shuts down on September 30, 2026, the last day of this conference. For three days, the people who study crowd work do it.</p>
      <form class="join" id="token-form" novalidate>
        <h2 class="join-title">Your access token</h2>
        <label class="lbl" for="j-token">Access token</label>
        <input type="text" id="j-token" name="token" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" required>
        <button class="btn wide" type="submit">Continue</button>
        <p class="form-err" role="alert">${esc(msg)}</p>
        <p class="fine">The organizers sent it to you in a Slack message. It is all you need, on any device. We are your requesters this week: by continuing you accept the <a href="privacy.html">privacy notice</a>, which says what we owe you. Other participants see only your pseudonym.</p>
      </form>`;
    document.getElementById("j-token").focus();
    window.scrollTo(0, 0);
  }

  async function submitToken(form) {
    const err = form.querySelector(".form-err");
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "Signing in…"; err.textContent = "";
    try {
      const out = await api("/api/access", { method: "POST", body: JSON.stringify({ token: form.querySelector("#j-token").value }) });
      ME = out.participant;
      JUST_JOINED = !out.returning;
      route();
    } catch (e) {
      err.textContent = e.message === "Failed to fetch" ? "You seem to be offline. Try again." : e.message;
      btn.disabled = false; btn.textContent = "Continue";
    }
  }

  // A new participant can swap the pseudonym they were given straight from the welcome.
  async function suggestPseudo(btn) {
    btn.disabled = true;
    try {
      const { pseudo } = await api("/api/pseudo?draw=1");
      ME = (await api("/api/pseudo", { method: "POST", body: JSON.stringify({ pseudo }) })).participant;
      updateAppbar();
      const b = document.getElementById("welcome-name");
      if (b) b.textContent = ME.pseudo;
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  }

  // ---------- Your details ----------
  let OPEN_EDITOR = false;  // "Choose my own" on the welcome opens the pseudonym editor
  function mePage() {
    currentKey = null;
    document.title = "Your details · Tokens of the Future";
    app.innerHTML = `
      <a class="back" href="#">← All topics</a>
      <div class="eyebrow"><span>Your details</span><span></span></div>
      <dl class="details">
        <dt>Pseudonym</dt><dd>
          <div id="ps-view"><b>${esc(ME.pseudo || "")}</b> <button class="btn small ghost" type="button" id="ps-edit">Change</button>
            <div class="fine">Your worker name: what other participants see on your notes.</div></div>
          <form class="ps-form" id="ps-form" hidden novalidate>
            <input type="text" id="ps-input" maxlength="40" autocomplete="off" spellcheck="false" aria-label="New pseudonym" value="${esc(ME.pseudo || "")}">
            <p class="fine" id="ps-status" aria-live="polite"></p>
            <div class="actions"><button class="btn small" type="submit" id="ps-save" disabled>Save</button><button class="btn small ghost" type="button" id="ps-draw">Suggest another</button><button class="btn small ghost" type="button" id="ps-cancel">Cancel</button></div>
            <p class="fine">Your earlier notes show the new name too.</p>
          </form></dd>
        <dt>Signing in</dt><dd>Your access token, from the organizers’ Slack message. Enter it on any other device to get your pseudonym and notes there.</dd>
      </dl>
      <div class="actions"><button class="btn ghost" type="button" id="logout">Sign out on this device</button></div>
      <section class="erase">
        <h3>Erase my details</h3>
        <p>This removes your pseudonym and unlinks your notes from your access token, so nobody, the organizers included, can tell they were yours. Your notes stay on the site as “Anonymous”. This cannot be undone. Your token still opens the app, as a new participant.</p>
        <label class="lbl" for="erase-confirm">Type your pseudonym to confirm</label>
        <input type="text" id="erase-confirm" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(ME.pseudo || "")}">
        <div class="actions"><button class="btn danger" type="button" id="erase-go">Erase my details permanently</button></div>
        <p class="form-err" role="alert" id="erase-err"></p>
      </section>`;
    document.getElementById("logout").onclick = async () => {
      try { await api("/api/logout", { method: "POST", body: "{}" }); } catch { /* signed out locally anyway */ }
      location.href = "/";  // the pass is gone too: the locked page asks for the token again
    };
    pseudoEditor();
    if (OPEN_EDITOR) { OPEN_EDITOR = false; document.getElementById("ps-edit").click(); }
    document.getElementById("erase-go").onclick = async () => {
      const err = document.getElementById("erase-err");
      try {
        const out = await api("/api/erase", { method: "POST", body: JSON.stringify({ confirm: document.getElementById("erase-confirm").value }) });
        ME = null; history.replaceState(null, "", "/");
        app.innerHTML = `<div class="eyebrow"><span>Your details</span><span></span></div>
          <p class="hook" role="status">Your details are erased. ${out.notes_kept} ${out.notes_kept === 1 ? "note stays" : "notes stay"} on the site as “Anonymous”, no longer linked to your token.</p>
          <p class="fine"><a href="/">Back to the start</a></p>`;
        updateAppbar();
      } catch (e) { err.textContent = e.message; }
    };
    window.scrollTo(0, 0);
  }

  // Change the pseudonym, checking as you type that nobody else goes by it.
  function pseudoEditor() {
    const view = document.getElementById("ps-view"), form = document.getElementById("ps-form");
    const input = document.getElementById("ps-input"), status = document.getElementById("ps-status"), save = document.getElementById("ps-save");
    let seq = 0, timer = null;
    const say = (text, kind = "") => { status.textContent = text; status.className = kind === "err" ? "form-err" : `fine${kind === "ok" ? " ok" : ""}`; };
    async function check() {
      const mine = ++seq, value = input.value.trim();
      save.disabled = true;
      if (!value || value === ME.pseudo) return say(value ? "That is your pseudonym now." : "");
      say("Checking…");
      try {
        const out = await api(`/api/pseudo?check=${encodeURIComponent(value)}`);
        if (mine !== seq) return;
        if (out.available) { say("Available.", "ok"); save.disabled = false; } else say(out.error, "err");
      } catch (e) { if (mine === seq) say(e.message, "err"); }
    }
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(check, 250); };
    document.getElementById("ps-edit").onclick = () => { view.hidden = true; form.hidden = false; input.focus(); input.select(); check(); };
    document.getElementById("ps-cancel").onclick = () => { form.hidden = true; view.hidden = false; };
    document.getElementById("ps-draw").onclick = async () => {
      try { input.value = (await api("/api/pseudo?draw=1")).pseudo; check(); } catch (e) { say(e.message, "err"); }
    };
    form.onsubmit = async e => {
      e.preventDefault(); e.stopPropagation();
      if (save.disabled) return;
      save.disabled = true; say("Saving…");
      try {
        ME = (await api("/api/pseudo", { method: "POST", body: JSON.stringify({ pseudo: input.value }) })).participant;
        updateAppbar(); mePage();
        document.getElementById("ps-view").insertAdjacentHTML("beforeend", `<div class="fine ok">Saved. Your notes now show this name.</div>`);
      } catch (err) { say(err.message, "err"); }
    };
  }

  // ---------- Feedback on the app ----------
  const FB_KIND = { bug: "Bug", idea: "Idea", wording: "Wording", other: "Other" };
  const FB_OPENER = {
    bug: "What happened, and what did you expect?",
    idea: "It would help if…",
    wording: "This text is unclear or wrong:…",
    other: "Tell us…",
  };
  const FB_STATUS = { open: "Open", planned: "Planned", done: "Done", wontfix: "Won’t do" };
  const pageLabel = h => h === "#" || h === "" ? "Home" : h === "#me" ? "Your details" : TOPICS[h.slice(1)]?.name || h;

  function feedbackItemHTML(f) {
    const who = esc(f.author || "An admin");
    return `<li class="fb-item${f.status === "done" || f.status === "wontfix" ? " closed" : ""}">
      <button class="vote" type="button" data-vote="${f.id}" aria-pressed="${f.mine}" aria-label="${f.mine ? "Remove your +1" : "+1 this"}"><b>+1</b><span>${f.votes}</span></button>
      <div>
        <div class="n-head"><span class="n-kind fb-${esc(f.kind)}">${esc(FB_KIND[f.kind])}</span><span class="fb-status s-${esc(f.status)}">${esc(FB_STATUS[f.status])}</span></div>
        <p class="n-body">${esc(f.body)}</p>
        <div class="n-meta">${who} · ${esc(when(f.created_at))}${f.page ? ` · on <a href="${esc(f.page)}">${esc(pageLabel(f.page))}</a>` : ""}</div>
      </div>
    </li>`;
  }

  function renderFeedbackList(items) {
    const el = document.getElementById("fb-list");
    if (!el) return;
    el.innerHTML = items.length
      ? `<div class="k">${items.length} ${items.length === 1 ? "item" : "items"} · most +1s first</div><ul class="fb-items">${items.map(feedbackItemHTML).join("")}</ul>`
      : `<p class="pulse-empty">No feedback yet. Be the first.</p>`;
  }

  async function feedbackPage() {
    currentKey = null;
    document.title = "Feedback · Tokens of the Future";
    const from = lastPage;
    app.innerHTML = `
      ${whoHTML()}
      <a class="back" href="${esc(from || "#")}">← Back to ${esc(pageLabel(from))}</a>
      <div class="eyebrow"><span>Improve this app</span><span>Built together</span></div>
      <h2 class="topic-title">Feedback</h2>
      <p class="lede">For the organizing team: tell each other what to fix or add in the app. Only admins see this list, and each of you can +1 what matters most.</p>
      <form class="note-form fb-form" id="fb-form" novalidate>
        <fieldset><legend>What kind of feedback?</legend><div class="seg">
          ${Object.entries(FB_KIND).map(([v, l], i) => `<label><input type="radio" name="kind" value="${v}"${i === 1 ? " checked" : ""}><span>${l}</span></label>`).join("")}
        </div></fieldset>
        <label class="lbl" for="fb-body">What should change?</label>
        <textarea id="fb-body" name="body" rows="4" maxlength="3000" placeholder="${esc(FB_OPENER.idea)}" required></textarea>
        <p class="fine">Sent with the page you came from (${esc(pageLabel(from))}) and your screen size, to help us reproduce it.</p>
        <div class="form-actions"><button class="btn" type="submit">Send feedback</button><span class="toast" id="toast" role="status"></span></div>
        <p class="form-err" role="alert"></p>
      </form>
      <section class="fb-list" id="fb-list" aria-live="polite"><p class="pulse-off">Loading feedback…</p></section>`;
    window.scrollTo(0, 0);
    try { renderFeedbackList((await api("/api/feedback")).items); }
    catch (e) { document.getElementById("fb-list").innerHTML = `<p class="pulse-off">${esc(e.message)}</p>`; }
  }

  function feedbackLocked() {
    currentKey = null;
    document.title = "Feedback · Tokens of the Future";
    app.innerHTML = `
      <a class="back" href="${esc(lastPage || "#")}">← Back</a>
      <div class="eyebrow"><span>Improve this app</span><span>Organizing team</span></div>
      <h2 class="topic-title">Feedback is for the organizing team</h2>
      <p class="lede">If you are one of the admins, open the <a href="console">console</a> with your personal token. The feedback box then appears on every page in this browser.</p>`;
    window.scrollTo(0, 0);
  }

  async function submitFeedback(form) {
    const err = form.querySelector(".form-err");
    const fd = new FormData(form);
    const body = String(fd.get("body") || "").trim();
    if (body.length < 5) { err.textContent = "Say a little more, so we can act on it."; form.querySelector("#fb-body").focus(); return; }
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true; err.textContent = "";
    try {
      const out = await api("/api/feedback", { method: "POST", body: JSON.stringify({
        kind: fd.get("kind"), body, page: lastPage, viewport: `${window.innerWidth}x${window.innerHeight}`,
      }) });
      form.querySelector("#fb-body").value = "";
      renderFeedbackList(out.items);
      toast("Thanks, it’s on the list");
    } catch (e) { err.textContent = e.message; }
    btn.disabled = false;
  }

  // ---------- Home ----------
  function home() {
    currentKey = null;
    document.title = "Tokens of the Future";
    const counts = {};
    for (const t of DATA.topics) counts[t.key] = DATA.blocks.reduce((n, b) => n + matches(b, t.key).length, 0);
    const dims = [];
    for (const t of DATA.topics) {
      let d = dims.find(x => x.name === t.dim);
      if (!d) dims.push(d = { name: t.dim, topics: [] });
      d.topics.push(t);
    }
    app.innerHTML = `
      ${whoHTML()}
      <div class="eyebrow"><span>HCOMP + CI 2026 · Alexandria, VA</span><span>Sep 28–30</span></div>
      <h1>Tokens of the Future</h1>
      ${JUST_JOINED ? `<div class="hook welcome"><p>Welcome, <b id="welcome-name">${esc(ME.pseudo)}</b>. That is your worker name this week: other participants see it on your notes, and nothing else about you. Not your style?</p>
        <div class="actions"><button class="btn small ghost" type="button" data-pseudo="suggest">Suggest another</button><a class="btn small ghost" href="#me" data-pseudo="own">Choose my own</a></div></div>` : ""}
      <p class="lede">The 2013 paper named twelve research areas; we added a thirteenth. Pick the one you care about. We’ll map your route through this week’s sessions and posters. Your task at each talk: a short note on what it says about your question. Every topic page shows back what the crowd found.</p>
      ${dims.map(d => `
        <section class="dim${d.name === "New in 2026" ? " new" : ""}">
          <div class="dim-label">${esc(d.name)}</div>
          <ul class="topics">
            ${d.topics.map(t => `
              <li><a class="topic-link" href="#${t.key}">
                <span class="t-num">${String(t.n).padStart(2, "0")}</span>
                <span class="t-name">${esc(t.name)}</span>
                <span class="t-count">${counts[t.key]} items</span>
                <span class="t-q">${esc(t.question)}</span>
              </a></li>`).join("")}
          </ul>
        </section>`).join("")}`;
    window.scrollTo(0, 0);
  }

  // ---------- Items and notes ----------
  function itemHTML(c, key, compact = false) {
    const others = c.tags.filter(t => t !== key).map(t => TOPICS[t]?.name).filter(Boolean);
    const on = stars.has(c.id);
    return `<li class="item${compact ? " compact" : ""}">
      <div class="item-top">
        <div>
          <div class="i-title"><span class="kind">${esc(c.kind)}</span>${esc(c.title)}</div>
          ${c.authors.length ? `<div class="i-meta">${esc(authors(c.authors))}</div>` : ""}
          ${!compact && others.length ? `<div class="chips">${others.map(o => `<span class="chip">also: ${esc(o)}</span>`).join("")}</div>` : ""}
        </div>
        <button class="star" type="button" data-star="${c.id}" aria-pressed="${on}" aria-label="${on ? "Remove from" : "Add to"} my picks: ${esc(c.title)}">${on ? "★" : "☆"}</button>
      </div>
      ${c.abstract ? `<details><summary>Abstract</summary><p>${esc(c.abstract)}</p></details>` : ""}
      <div class="notes" data-notes="${c.id}">${notesHTML(c.id)}</div>
    </li>`;
  }

  function noteHTML(n) {
    const parts = PARTS[n.kind] || PARTS.comment;
    const byline = n.author ? esc(n.author) : "Anonymous";
    return `<li class="note">
      <div class="n-head"><span class="n-kind n-${esc(n.kind)}">${esc(KIND[n.kind])}</span>
        <span class="n-rel">${esc(RELATION[n.relation])}</span>
        ${n.horizon_months !== null && n.horizon_months !== undefined ? `<span class="n-rel">${esc(livesIt(n.horizon_months))}</span>` : ""}</div>
      <p class="n-body n-point">${esc(n.point || n.body)}</p>
      ${n.why ? `<p class="n-body"><span class="n-lbl">${esc(parts[1][0])}</span> ${esc(n.why)}</p>` : ""}
      ${n.evidence ? `<p class="n-body"><span class="n-lbl">${esc(parts[2][0])}</span> ${esc(n.evidence)}</p>` : ""}
      ${n.horizon_note ? `<p class="n-hnote">On timing: ${esc(n.horizon_note)}</p>` : ""}
      <div class="n-meta">${byline} · ${esc(when(n.created_at))}</div>
    </li>`;
  }

  function notesHTML(itemId, expanded = false) {
    if (!NOTES.ok) return "";
    const list = NOTES.byItem.get(itemId) || [];
    const shown = expanded ? list : list.slice(0, 2);
    return `
      ${list.length ? `<ul class="note-list">${shown.map(noteHTML).join("")}</ul>` : ""}
      ${list.length > shown.length ? `<button class="linkish" type="button" data-notes-more="${itemId}">Show all ${list.length} notes</button>` : ""}
      <button class="note-open" type="button" data-note-open="${itemId}">Add a comment, question or criticism</button>`;
  }

  function refreshNotes(itemId, expanded = false) {
    document.querySelectorAll(`[data-notes="${itemId}"]`).forEach(el => { el.innerHTML = notesHTML(itemId, expanded); });
  }

  function partsHTML(kind) {
    return PARTS[kind].map(([label, opener], i) => `
      <label class="lbl part-lbl" for="nf-p${i}">${esc(label)}${i ? ` <span class="opt">optional</span>` : ""}</label>
      <textarea id="nf-p${i}" name="p${i}" rows="${i ? 2 : 3}" maxlength="1500" placeholder="${esc(opener)}"${i ? "" : " required"}></textarea>`).join("");
  }

  function formHTML(itemId, topic) {
    const radios = (name, opts, legend) => `
      <fieldset><legend>${legend}</legend><div class="seg">
        ${Object.entries(opts).map(([v, l], i) => `<label><input type="radio" name="${name}" value="${v}"${name === "kind" && i === 0 ? " checked" : ""} required><span>${esc(l)}</span></label>`).join("")}
      </div></fieldset>`;
    return `<form class="note-form" data-item="${itemId}" novalidate>
      ${radios("kind", KIND, "What are you adding?")}
      <div class="parts" id="nf-parts">${partsHTML("comment")}</div>
      <div class="anchor" aria-hidden="true"><span class="anchor-bar"><i id="nf-anchor"></i></span><span id="nf-words">0 words</span></div>
      ${radios("relation", RELATION, `What does this talk say about <b>${esc(topic.name)}</b>?`)}
      <fieldset class="horizon"><legend>When do you think you will live in the future this talk points to?</legend>
        <input type="range" id="nf-horizon" min="0" max="${HORIZONS.length - 1}" step="1" value="4" aria-describedby="nf-horizon-out" data-touched="0">
        <div class="ticks" aria-hidden="true">${TICKS.map(t => `<span>${t}</span>`).join("")}</div>
        <output id="nf-horizon-out" for="nf-horizon">Not answered. Move the slider to answer.</output>
        <label class="lbl" for="nf-hnote">Why that timing? <span class="opt">optional</span></label>
        <input type="text" id="nf-hnote" name="horizon_note" maxlength="300" placeholder="What has to happen first?">
      </fieldset>
      <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="courtesy">Speakers and fellow participants read these notes. Be courteous and constructive: engage with the ideas, and say what would make the work stronger.</p>
      <p class="fine">Posted as <b>${esc(ME?.pseudo || "")}</b>. Only signed-in participants see notes, under your worker name. The CrowdCamp team may quote them without names in a research write-up.</p>
      <div class="form-actions">
        <button class="btn" type="submit">Post note</button>
        <button class="btn ghost" type="button" data-cancel>Cancel</button>
      </div>
      <p class="form-err" role="alert"></p>
    </form>`;
  }

  function openForm(itemId) {
    if (!ME) { splash("Sign in to leave a note."); return; }
    document.querySelectorAll(".note-form").forEach(f => f.remove());
    document.querySelectorAll(".note-open[hidden]").forEach(b => { b.hidden = false; });
    const box = document.querySelector(`[data-notes="${itemId}"]`);
    const btn = box?.querySelector("[data-note-open]");
    if (!box || !btn) return;
    btn.hidden = true;
    box.insertAdjacentHTML("beforeend", formHTML(itemId, TOPICS[currentKey]));
    box.querySelector("#nf-p0").focus();
  }

  function closeForm(form) {
    const box = form.closest("[data-notes]");
    form.remove();
    box?.querySelector("[data-note-open]")?.removeAttribute("hidden");
  }

  function updateAnchor(form) {
    const n = [0, 1, 2].reduce((s, i) => s + words(form.querySelector(`#nf-p${i}`)?.value || ""), 0);
    form.querySelector("#nf-anchor").style.width = `${Math.min(100, (n / ANCHOR_WORDS) * 100)}%`;
    form.querySelector("#nf-words").textContent = `${n} ${n === 1 ? "word" : "words"}`;
  }

  // Swap the sentence openers when the kind changes, keeping what was typed.
  function switchKind(form, kind) {
    const typed = [0, 1, 2].map(i => form.querySelector(`#nf-p${i}`).value);
    form.querySelector("#nf-parts").innerHTML = partsHTML(kind);
    typed.forEach((v, i) => { form.querySelector(`#nf-p${i}`).value = v; });
  }

  function setHorizon(form, index, how) {
    const slider = form.querySelector("#nf-horizon");
    const out = form.querySelector("#nf-horizon-out");
    const fs = slider.closest("fieldset");
    if (index === null) {
      slider.dataset.touched = "0"; slider.value = 4; fs.classList.remove("answered");
      out.textContent = "Not answered. Move the slider to answer.";
      return;
    }
    slider.value = index;
    slider.dataset.touched = how;  // "1" moved by hand, "auto" set from "It came true"
    fs.classList.add("answered");
    out.textContent = sliderSays(HORIZONS[index]);
  }

  async function submitNote(form) {
    const err = form.querySelector(".form-err");
    const fd = new FormData(form);
    const point = String(fd.get("p0") || "").trim();
    if (point.length < 3) { err.textContent = "Write your main point in a few words."; form.querySelector("#nf-p0").focus(); return; }
    if (!fd.get("relation")) { err.textContent = `Say what the talk says about ${TOPICS[currentKey].name}.`; return; }
    const slider = form.querySelector("#nf-horizon");
    const payload = {
      item_id: +form.dataset.item, topic: currentKey, kind: fd.get("kind"), relation: fd.get("relation"),
      point, why: fd.get("p1"), evidence: fd.get("p2"),
      horizon_months: slider.dataset.touched !== "0" ? HORIZONS[+slider.value] : null,
      horizon_note: fd.get("horizon_note"), website: fd.get("website"),
    };
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true; submit.textContent = "Posting…"; err.textContent = "";
    try {
      const out = await api("/api/notes", { method: "POST", body: JSON.stringify(payload) });
      if (out.note) {
        const list = NOTES.byItem.get(out.note.item_id) || [];
        list.unshift(out.note);
        NOTES.byItem.set(out.note.item_id, list);
        tally(NOTES.summary, out.note);
      }
      refreshNotes(payload.item_id);
      renderPulse();
      toast("Note posted");
    } catch (e) {
      if (e.status === 401) { ME = null; err.textContent = "Your session ended. Copy your note, then sign in again from the top of the page."; }
      else err.textContent = e.message === "Failed to fetch" ? "You seem to be offline. Your note is still here; try again." : e.message;
      submit.disabled = false; submit.textContent = "Post note";
    }
  }

  // ---------- Topic pulse ----------
  function tally(summary, n) {
    summary.notes++;
    summary.relation[n.relation]++;
    if (n.horizon_months !== null) summary.horizon[n.horizon_months]++;
  }

  function median(hist) {
    const all = HORIZONS.flatMap(h => Array(hist[h] || 0).fill(h));
    return all.length ? all[Math.floor((all.length - 1) / 2)] : null;
  }

  function renderPulse() {
    const el = document.getElementById("pulse");
    if (!el) return;
    if (!NOTES.ok) { el.innerHTML = `<p class="pulse-off">Notes from attendees appear here on the live site.</p>`; return; }
    const s = NOTES.summary;
    if (!s.notes) { el.innerHTML = `<div class="k">What the crowd found</div><p class="pulse-empty">No notes on this topic yet. Attend a talk below and add the first one.</p>`; return; }
    const relMax = Math.max(1, ...Object.values(s.relation));
    const hMax = Math.max(1, ...HORIZONS.map(h => s.horizon[h] || 0));
    const answered = HORIZONS.reduce((n, h) => n + (s.horizon[h] || 0), 0);
    const med = median(s.horizon);
    el.innerHTML = `
      <div class="k">What the crowd found ·${s.notes} ${s.notes === 1 ? "note" : "notes"}</div>
      <div class="bars">${Object.entries(RELATION).map(([k, l]) => `
        <div class="bar-row"><span class="bar-l">${esc(l)}</span><span class="bar"><i style="--w:${(s.relation[k] / relMax) * 100}%"></i></span><span class="bar-n">${s.relation[k]}</span></div>`).join("")}
      </div>
      <div class="k hz-k">When will people live in this future?${med !== null ? ` Median: ${esc(horizonLabel(med))}` : ""}</div>
      ${answered ? `<div class="hist" role="img" aria-label="${answered} answers, median ${esc(horizonLabel(med))}">${HORIZONS.map((h, i) => `
        <div class="col"><span class="colbar${h === 0 ? " now" : ""}" style="--h:${((s.horizon[h] || 0) / hMax) * 100}%"></span><span class="col-n">${s.horizon[h] || 0}</span><span class="col-l">${SHORT[i]}</span></div>`).join("")}
      </div>` : `<p class="pulse-empty">Nobody has answered the timing question yet.</p>`}`;
  }

  async function loadNotes(key) {
    NOTES = { topic: key, ok: false, byItem: new Map(), summary: null };
    if (API) {
      try {
        const data = await api(`/api/notes?topic=${encodeURIComponent(key)}`);
        if (currentKey !== key) return;
        NOTES.ok = true;
        NOTES.summary = data.summary;
        for (const n of data.notes) {
          if (!NOTES.byItem.has(n.item_id)) NOTES.byItem.set(n.item_id, []);
          NOTES.byItem.get(n.item_id).push(n);
        }
      } catch { /* offline: notes stay hidden */ }
    }
    if (currentKey !== key) return;
    document.querySelectorAll("[data-notes]").forEach(el => { el.innerHTML = notesHTML(+el.dataset.notes); });
    renderPulse();
  }

  // ---------- Route ----------
  function planSlot(blocks, key) {
    if (blocks.every(isBreak)) return { type: "break", block: blocks[0] };
    const real = blocks.filter(b => !isBreak(b));
    const everything = real.flatMap(b => b.contents);
    const rest = hits => everything.filter(c => !hits.includes(c));
    if (real.length === 1) {
      const b = real[0];
      if (!b.contents.length) return { type: "info", block: b };
      const hits = matches(b, key);
      return { type: isPosters(b) ? "posters" : "plenary", block: b, hits, rest: rest(hits) };
    }
    const ranked = real.map(b => ({ b, s: blockScore(b, key) })).sort((x, y) => y.s - x.s);
    if (ranked[0].s === 0) return { type: "free", blocks: real, hits: [], rest: everything };
    const hits = matches(ranked[0].b, key);
    return { type: "pick", block: ranked[0].b, hits, alts: ranked.slice(1), rest: rest(hits) };
  }

  function restHTML(plan, key) {
    if (!plan.rest?.length) return "";
    const label = plan.type === "posters" ? "all posters and demos" : "every talk in this slot";
    return `<details class="rest"><summary>Went to something else? See ${label} (${plan.rest.length} more)</summary>
      <ul class="items">${plan.rest.map(c => itemHTML(c, key, true)).join("")}</ul></details>`;
  }

  function slotHTML(plan, key, tipUsed) {
    const t12 = hm => { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
    const time = b => `<div class="time">${t12(b.start)} – ${t12(b.end)}</div>`;
    // The program app marks each session with its type colour; so do we.
    const stripe = b => /^#[0-9a-f]{3,8}$/i.test(b.color || "") ? ` style="--stripe:${b.color}"` : "";
    if (plan.type === "break") {
      const tip = !tipUsed.has(plan.block.day) && /Coffee/.test(plan.block.name);
      if (tip) tipUsed.add(plan.block.day);
      return `<div class="slot quiet">${time(plan.block)}<div class="s-card"${stripe(plan.block)}><div class="s-name">${esc(plan.block.name)}</div>
        ${tip ? `<p class="tip">Find one speaker from the morning and ask them your 2026 question.</p>` : ""}</div></div>`;
    }
    if (plan.type === "info") {
      return `<div class="slot quiet">${time(plan.block)}<div class="s-card"${stripe(plan.block)}><div class="s-name">${esc(plan.block.name)}</div>
        <div class="room">${esc(plan.block.room)}</div></div></div>`;
    }
    if (plan.type === "free") {
      return `<div class="slot">${time(plan.blocks[0])}<div class="s-card"${stripe(plan.blocks[0])}>
        <div class="s-head"><span class="pill free">Your call</span></div>
        <p class="why">Nothing here matches this topic directly. Either session works:</p>
        <div class="alt">${plan.blocks.map(b => `<b>${esc(b.name)}</b> · ${esc(b.room)}`).join("<br>")}</div>
        ${restHTML(plan, key)}</div></div>`;
    }
    const b = plan.block, hits = plan.hits;
    const pill = plan.type === "pick" ? `<span class="pill go">Go here</span>`
      : plan.type === "posters" ? `<span class="pill ${hits.length ? "go" : "all"}">Posters</span>` : `<span class="pill all">Everyone</span>`;
    let why = "";
    if (plan.type === "posters") why = hits.length ? `${hits.length} of ${b.contents.length} posters and demos match. Visit these:` : `No posters here match directly. Browse freely.`;
    else if (plan.type === "pick") why = `${hits.length} of ${b.contents.length} ${b.contents.length === 1 ? "item matches" : "items match"} your topic.`;
    else if (hits.length) why = `Relevant to your topic:`;
    const alts = plan.alts?.length ? `<div class="alt">Also in this slot: ${plan.alts.map(a => `<b>${esc(a.b.name)}</b> · ${esc(a.b.room)}${a.s ? ` (${matches(a.b, key).length} matching)` : ""}`).join("; ")}</div>` : "";
    return `<div class="slot">${time(b)}<div class="s-card"${stripe(b)}>
      <div class="s-head">${pill}<span class="s-name">${esc(b.name)}</span></div>
      <div class="room">${esc(b.room)}</div>
      ${why ? `<p class="why">${why}</p>` : ""}
      ${hits.length ? `<ul class="items">${hits.map(c => itemHTML(c, key)).join("")}</ul>` : ""}
      ${alts}${restHTML(plan, key)}</div></div>`;
  }

  function journey(key) {
    const t = TOPICS[key];
    if (!t) return home();
    currentKey = key;
    document.title = `${t.name} · Tokens of the Future`;
    const plans = [];
    let sessions = 0, items = 0, posters = 0;
    for (const [day, slots] of Object.entries(slotsByDay())) {
      const dayPlans = Object.keys(slots).sort().map(s => planSlot(slots[s], key));
      for (const p of dayPlans) {
        if (p.type === "pick" || (p.type === "plenary" && p.hits.length)) sessions++;
        if (p.type === "posters") posters += p.hits.length;
        else if (p.hits) items += p.hits.length;
      }
      plans.push([day, dayPlans]);
    }
    const tipUsed = new Set();
    app.innerHTML = `
      ${whoHTML()}
      <a class="back" href="#">← All topics</a>
      <div class="eyebrow"><span>${esc(t.dim)}</span><span>${String(t.n).padStart(2, "0")} / 13</span></div>
      <h2 class="topic-title">${esc(t.name)}</h2>
      <div class="then-now">
        <div><div class="k k13">2013 vision</div><p class="vision">${esc(t.vision)}</p></div>
        <div class="ask-box"><div class="k k26">Your question this week</div><p class="ask">${esc(t.question)}</p>
          ${citeHTML(t.cite)}
          <p class="ask-hint">Ask it in Q&amp;A, at a poster or over coffee. Then add a note to the talk.</p></div>
      </div>
      <section class="pulse" id="pulse" aria-live="polite"><p class="pulse-off">Loading notes…</p></section>
      <div class="stats"><span><b>${sessions}</b> sessions to attend</span><span><b>${items}</b> talks and papers</span><span><b>${posters}</b> posters and demos</span></div>
      <div class="actions">
        <button class="btn" type="button" id="ics">Add route to calendar</button>
        <button class="btn ghost" type="button" id="share">Copy link</button>
        <span class="toast" id="toast" role="status"></span>
      </div>
      ${plans.map(([day, ps]) => `
        <section class="day"><h3>${DAY_NAMES[day]}<span>${DAY_SHORT[day]}</span></h3>
          ${ps.map(p => slotHTML(p, key, tipUsed)).join("")}
        </section>`).join("")}`;
    document.getElementById("ics").onclick = () => downloadICS(t, plans);
    document.getElementById("share").onclick = () => copyLink();
    window.scrollTo(0, 0);
    loadNotes(key);
  }

  // ---------- Actions ----------
  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.textContent = ""; }, 2500);
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
    catch { toast(location.href); }
  }

  // Program times are local (EDT, UTC-4).
  const utc = (day, hm) => { const [h, m] = hm.split(":").map(Number); const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h + 4, m)); return d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };
  const icsText = s => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m);

  function downloadICS(t, plans) {
    const ev = [];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    for (const [, ps] of plans) for (const p of ps) {
      if (!["pick", "plenary", "posters"].includes(p.type)) continue;
      if (p.type !== "pick" && !p.hits.length) continue;
      const b = p.block;
      const desc = [`Your question: ${t.question}`, "", ...p.hits.map(c => `• ${c.title}${stars.has(c.id) ? " ★" : ""}`)].join("\n");
      ev.push(["BEGIN:VEVENT", `UID:cwj-${t.key}-${b.id}@crowdcamp2026`, `DTSTAMP:${stamp}`,
        `DTSTART:${utc(b.day, b.start)}`, `DTEND:${utc(b.day, b.end)}`,
        `SUMMARY:${icsText(`${b.name} (${t.name})`)}`, `LOCATION:${icsText(b.room + ", Virginia Tech Academic Building One")}`,
        `DESCRIPTION:${icsText(desc)}`, "END:VEVENT"].join("\r\n"));
    }
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CrowdCamp 2026//Tokens of the Future//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `hcomp-ci-2026-${t.key}.ics` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`${ev.length} sessions exported`);
  }

  // ---------- Events ----------
  app.addEventListener("click", e => {
    const ps = e.target.closest("[data-pseudo]");
    if (ps) {
      if (ps.dataset.pseudo === "suggest") { e.preventDefault(); suggestPseudo(ps); }
      else OPEN_EDITOR = true;  // the link goes on to #me, which opens the editor
      return;
    }
    const star = e.target.closest("[data-star]");
    if (star) {
      const id = +star.dataset.star;
      stars.has(id) ? stars.delete(id) : stars.add(id);
      saveStars();
      const on = stars.has(id);
      star.setAttribute("aria-pressed", on);
      star.textContent = on ? "★" : "☆";
      star.setAttribute("aria-label", star.getAttribute("aria-label").replace(/^(Add to|Remove from)/, on ? "Remove from" : "Add to"));
      return;
    }
    const open = e.target.closest("[data-note-open]");
    if (open) return openForm(+open.dataset.noteOpen);
    const more = e.target.closest("[data-notes-more]");
    if (more) return refreshNotes(+more.dataset.notesMore, true);
    const cancel = e.target.closest("[data-cancel]");
    if (cancel) return closeForm(cancel.closest("form"));
    const vote = e.target.closest("[data-vote]");
    if (vote) {
      vote.disabled = true;
      api("/api/feedback", { method: "POST", body: JSON.stringify({ vote: +vote.dataset.vote }) })
        .then(out => renderFeedbackList(out.items))
        .catch(err => { vote.disabled = false; toast(err.message); });
    }
  });

  app.addEventListener("change", e => {
    const t = e.target;
    if (t.closest("#fb-form") && t.name === "kind") { document.getElementById("fb-body").placeholder = FB_OPENER[t.value]; return; }
    const form = t.closest(".note-form");
    if (!form) return;
    if (t.name === "kind") { switchKind(form, t.value); updateAnchor(form); return; }
    if (t.name === "relation") {
      const slider = form.querySelector("#nf-horizon");
      // "It came true" means the future is already here: put the slider there.
      if (t.value === "happened" && slider.dataset.touched !== "1") setHorizon(form, 0, "auto");
      else if (t.value !== "happened" && slider.dataset.touched === "auto") setHorizon(form, null);
    }
  });

  app.addEventListener("input", e => {
    const form = e.target.closest(".note-form");
    if (!form) return;
    if (e.target.id === "nf-horizon") setHorizon(form, +e.target.value, "1");
    else if (/^nf-p\d$/.test(e.target.id)) updateAnchor(form);
  });

  app.addEventListener("submit", e => {
    e.preventDefault();
    if (e.target.id === "token-form") return submitToken(e.target);
    if (e.target.id === "fb-form") return submitFeedback(e.target);
    const form = e.target.closest(".note-form");
    if (form) submitNote(form);
  });

  // A feedback button on every page once signed in.
  const fab = Object.assign(document.createElement("a"), { className: "fb-fab", href: "#feedback", textContent: "Feedback" });
  fab.hidden = true;
  document.body.appendChild(fab);

  function updateAppbar() {
    const el = document.getElementById("appbar-who");
    if (el) el.innerHTML = ME ? `${esc(ME.pseudo)} · <a href="#me">Your details</a>` : "";
  }

  function route() {
    const k = location.hash.slice(1);
    updateAppbar();
    if (k) JUST_JOINED = false;
    fab.hidden = !ADMIN || k === "feedback";
    if (API && !ME) return splash();
    if (k !== "feedback") lastPage = location.hash || "#";
    if (k === "feedback" && ME) return ADMIN ? feedbackPage() : feedbackLocked();
    if (k === "me" && ME) return mePage();
    k && k !== "me" && k !== "feedback" ? journey(k) : home();
  }
  window.addEventListener("hashchange", route);

  // The API is absent on a plain static preview; the route planner still works there.
  const meReq = fetch("/api/me", { credentials: "same-origin" })
    .then(r => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : null))
    .catch(() => null);
  Promise.all([fetch("data.json").then(r => r.json()), meReq]).then(([d, me]) => {
    DATA = d;
    for (const t of d.topics) TOPICS[t.key] = t;
    API = !!me;
    ME = me?.participant || null;
    ADMIN = me?.admin || null;
    // A first sign-in through the locked page or a token link lands with ?new.
    const params = new URLSearchParams(location.search);
    if (params.has("new")) { JUST_JOINED = !!ME; params.delete("new"); history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash); }
    route();
  }).catch(() => { app.innerHTML = `<p class="loading">Could not load the program. Refresh the page to try again.</p>`; });
})();
