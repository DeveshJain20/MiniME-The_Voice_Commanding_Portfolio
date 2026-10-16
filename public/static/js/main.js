(function () {
  "use strict";

  const C = window.SITE_CONTENT;
  const P = C.profile;
  const T = C.topics;
  const $ = (id) => document.getElementById(id);

  /* -- DOM refs -- */
  const appRoot = $("appRoot");
  const micBtn = $("micBtn");
  const micStatus = $("micStatus");
  const micFallback = $("micFallback");
  const typeForm = $("typeForm");
  const typeInput = $("typeInput");
  const typeToggle = $("typeToggle");
  const transcriptEl = $("transcript");
  const welcomeState = $("welcomeState");
  const choiceExplore = $("choiceExplore");
  const choiceTour = $("choiceTour");
  const sectionNav = $("sectionNav");
  const responsePanel = $("responsePanel");
  const captionText = $("captionText");
  const panelBody = $("panelBody");
  const chipsEl = $("chips");
  const tourBar = $("tourBar");
  const tourProgress = $("tourProgress");
  const tourFill = $("tourFill");
  const tourBackBtn = $("tourBackBtn");
  const tourPauseBtn = $("tourPauseBtn");
  const tourSkipBtn = $("tourSkipBtn");
  const tourStopBtn = $("tourStopBtn");
  const aiStatusNote = $("aiStatusNote");
  const muteBtn = $("muteBtn");
  const voiceSelect = $("voiceSelect");
  const rateSelect = $("rateSelect");

  /* -- Environment -- */
  const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  // Desktop browsers keep the mic open continuously. Phones play a system
  // "ding" on every restart and pick up their own speaker, so there the mic
  // pauses while MINIme talks and is only re-opened after she finishes.
  const RESTART_ON_SILENCE = !IS_MOBILE;
  const REC_LANG = /^en/i.test(navigator.language || "") ? navigator.language : "en-US";
  // With a hosted PDF the buttons open/download it; otherwise they open the
  // HTML copy of the resume (resume.html), which prints or saves as a PDF.
  const HAS_PDF = !!C.resume_path;
  const RESUME_URL = HAS_PDF ? "/static/" + C.resume_path : "/resume.html";

  /* -- Helpers -- */
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("minime." + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("minime." + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    },
  };

  /* -- State -- */
  const state = {
    current: "idle",   // idle | listening | processing | speaking
    awaiting: null,    // null | "mode" (explore or everything?) | "contact"
    topic: null,       // last topic shown \u2014 what "tell me more" refers to
    projectId: null,   // last project discussed \u2014 what "open the link" refers to
    muted: !!store.get("muted", false),
    rate: Number(store.get("rate", 1.05)) || 1.05,
    voiceName: store.get("voice", ""),
  };
  const tour = { active: false, paused: false, index: -1, resumeIndex: -1 };

  // Listening state (declared up here because speech helpers touch it)
  let recognition = null;
  let alwaysOn = false;          // the mic should stay open
  let running = false;           // recognition session currently open
  let suspendedForSpeech = false;
  let heardSomething = false;
  let committed = false;
  let restartTimer = null;
  let interimTimer = null;
  let errorStreak = 0;

  // Speech state
  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  let speechToken = 0;
  let speaking = false;
  let speakTimer = null;
  let lastSpoken = "";
  let lastSpeechEnd = 0;
  let aiSeq = 0;

  /* -- Status line / mic button -- */
  function setStatus(next) {
    state.current = next;
    micBtn.classList.toggle("is-listening", next === "listening");
    micBtn.classList.toggle("is-speaking", next === "speaking");
    micBtn.classList.toggle("is-processing", next === "processing");
    const labels = {
      idle: "Tap to talk",
      listening: "Listening \u2014 say \u201cHey MINIme\u201d",
      processing: "Thinking\u2026",
      speaking: IS_MOBILE ? "Speaking\u2026" : "Speaking \u2014 say \u201cstop\u201d to interrupt",
    };
    micStatus.textContent = labels[next];
  }
  function idleStatus() { setStatus(alwaysOn ? "listening" : "idle"); }

  function showTranscript(text) {
    transcriptEl.classList.remove("is-live");
    transcriptEl.textContent = "\u201c" + text + "\u201d";
  }
  function showLive(text) {
    transcriptEl.classList.add("is-live");
    transcriptEl.textContent = "\u201c" + text + "\u2026\u201d";
  }

  /* ==
     VOICE OUT \u2014 a female English voice, read in short natural chunks
     == */

  // Written text \u2192 spoken text. Display text is never changed; only what the
  // speech engine reads, so "FastAPI" isn't read as one strange word.
  const PRONOUNCE = [
    [/\bMINIme\b/g, "Mini me"],
    [/\bFastAPI\b/g, "Fast A P I"],
    [/\bSQLAlchemy\b/g, "S Q L Alchemy"],
    [/\bPostgreSQL\b/g, "Postgres Q L"],
    [/\bNext\.js\b/g, "Next J S"],
    [/\bGSAP\b/g, "G Sap"],
    [/\bJWT\b/g, "J W T"],
    [/\bCEH\b/g, "C E H"],
    [/\bCSCU\b/g, "C S C U"],
    [/\bAWS\b/g, "A W S"],
    [/\bNPTEL\b/g, "N P T E L"],
    [/\bSGPA\b/g, "S G P A"],
    [/\bSIH\b/g, "S I H"],
    [/\bLLM\b/g, "L L M"],
    [/\bMCP\b/g, "M C P"],
    [/\bSQL\b/g, "S Q L"],
    [/\bSKUs\b/g, "S K Us"],
    [/\bAPIs\b/g, "A P Is"],
    [/\bAPI\b/g, "A P I"],
    [/\bUI\b/g, "U I"],
    [/\bCI\b/g, "C I"],
    [/\bJSON\b/g, "Jason"],
    [/\bREST\b/g, "rest"],
    [/\bC\+\+/g, "C plus plus"],
    [/\bLlama 3\.3 70B\b/g, "Llama three point three, seventy B"],
    [/\bbcrypt\b/gi, "bee crypt"],
    [/\bTryHackMe\b/g, "Try Hack Me"],
    [/\bBigQuery\b/g, "Big Query"],
    [/\bFocusUp\b/g, "Focus Up"],
    [/\bGroq\b/g, "Grok"],
    [/\bRazorpay\b/g, "Razor pay"],
    [/\bPlantNet\b/g, "Plant Net"],
    [/\bEC-Council\b/g, "E C Council"],
    [/\bVercel\b/g, "Ver-sell"],
    [/&/g, " and "],
  ];
  function toSpeech(text) {
    let out = text;
    for (const [re, to] of PRONOUNCE) out = out.replace(re, to);
    return out;
  }

  // Long utterances get cut off silently by some Chrome voices, so speech is
  // sent in short sentence-sized pieces. It also lets the caption follow along.
  function softSplit(sentence) {
    const parts = sentence.split(/([,;\u2014:])/);
    const pieces = [];
    let cur = "";
    for (const part of parts) {
      cur += part;
      if (/^[,;\u2014:]$/.test(part) && cur.length >= 90) { pieces.push(cur.trim()); cur = ""; }
    }
    if (cur.trim()) pieces.push(cur.trim());
    return pieces;
  }
  function chunkText(text) {
    const sentences = text.match(/[\s\S]+?(?:[.!?]+["')\]]*(?=\s|$)|$)/g) || [text];
    const units = [];
    for (const s of sentences) {
      if (s.length > 210) units.push(...softSplit(s));
      else if (s.trim()) units.push(s.trim());
    }
    const chunks = [];
    let cur = "";
    for (const u of units) {
      if (cur && (cur + " " + u).length > 170) { chunks.push(cur); cur = u; }
      else cur = cur ? cur + " " + u : u;
    }
    if (cur) chunks.push(cur);
    return chunks.length ? chunks : [text];
  }
  const tidy = (chunk) => chunk.replace(/[,;:\u2014\s]+$/, "");
  function estimateReadMs(text) {
    const words = text.split(/\s+/).length;
    return Math.max(1400, (words * 330) / state.rate);
  }

  /* -- Voice picking -- */
  const FEMALE_HINTS = [
    "neerja", "aria", "jenny", "zira", "heera", "samantha", "veena", "karen", "moira",
    "tessa", "serena", "fiona", "google uk english female", "female", "susan", "hazel",
    "catherine", "google us english",
  ];
  const MALE_RE = /\b(david|mark|george|james|ravi|prabhat|hemant|guy|ryan|daniel|fred|male|alex|thomas|rishi)\b/i;
  let chosenVoice = null;
  let voiceIsAuto = true;

  function looksFemale(v) {
    return !!v && FEMALE_HINTS.some((h) => v.name.toLowerCase().includes(h));
  }
  function autoVoice(list) {
    const locale = (navigator.language || "en-US").toLowerCase();
    const score = (v) => {
      const n = v.name.toLowerCase();
      let s = 0;
      const idx = FEMALE_HINTS.findIndex((h) => n.includes(h));
      if (idx >= 0) s += 100 - idx;
      if (/natural|neural|online/.test(n)) s += 20;
      if (v.lang.toLowerCase() === locale) s += 10;
      else if (v.lang.toLowerCase().startsWith(locale.slice(0, 2))) s += 3;
      if (MALE_RE.test(n)) s -= 80;
      return s;
    };
    return list.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }
  function loadVoices() {
    if (!synth) return;
    const all = synth.getVoices();
    if (!all.length) return;
    const english = all.filter((v) => /^en/i.test(v.lang));
    const list = english.length ? english : all;
    voiceSelect.innerHTML =
      '<option value="">Automatic (female English)</option>' +
      list.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} \u2014 ${esc(v.lang)}</option>`).join("");
    const saved = state.voiceName ? all.find((v) => v.name === state.voiceName) : null;
    voiceIsAuto = !saved;
    chosenVoice = saved || autoVoice(list);
    voiceSelect.value = saved ? saved.name : "";
  }
  if (synth) {
    loadVoices();
    if (synth.addEventListener) synth.addEventListener("voiceschanged", loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }

  /* -- speak / stop -- */
  function speak(text, opts) {
    opts = opts || {};
    const myToken = ++speechToken;
    clearTimeout(speakTimer);
    const wasBusy = !!synth && (synth.speaking || synth.pending);
    if (synth) synth.cancel();

    lastSpoken = text;
    speaking = true;
    setStatus("speaking");

    const finish = () => {
      if (myToken !== speechToken) return; // a newer command took over
      clearTimeout(speakTimer);
      speaking = false;
      lastSpeechEnd = Date.now();
      idleStatus();
      if (suspendedForSpeech) {
        suspendedForSpeech = false;
        if (alwaysOn) startListening();
      }
      if (opts.onEnd) opts.onEnd();
    };

    // Voice off, or no speech engine: show the text and keep the flow moving
    // (a tour advances after roughly the time it takes to read).
    if (!synth || state.muted) {
      captionText.textContent = opts.caption != null ? opts.caption : text;
      speakTimer = setTimeout(finish, estimateReadMs(text));
      return;
    }

    const chunks = chunkText(text);
    captionText.textContent = opts.caption != null ? opts.caption : tidy(chunks[0]);

    if (IS_MOBILE && running) {
      suspendedForSpeech = true;
      try { recognition.abort(); } catch (e) { /* already closed */ }
      running = false;
    }

    // Safety net: some browsers occasionally never fire the final "end" event.
    speakTimer = setTimeout(finish, estimateReadMs(text) * 1.6 + 6000);

    const begin = () => {
      if (myToken !== speechToken) return;
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(toSpeech(chunk));
        if (chosenVoice) u.voice = chosenVoice;
        u.lang = (chosenVoice && chosenVoice.lang) || REC_LANG;
        u.rate = state.rate;
        // Only nudge the pitch up when the automatic pick isn't a known female voice.
        u.pitch = voiceIsAuto && !looksFemale(chosenVoice) ? 1.2 : 1.0;
        u.onstart = () => {
          if (myToken === speechToken && opts.caption == null) captionText.textContent = tidy(chunk);
        };
        u.onend = () => {
          if (myToken === speechToken && i === chunks.length - 1) finish();
        };
        u.onerror = (e) => {
          if (myToken !== speechToken) return;
          if (e && (e.error === "interrupted" || e.error === "canceled")) return;
          if (i === chunks.length - 1) finish();
        };
        synth.speak(u);
      });
    };
    // Chrome drops a speak() issued the instant after cancel(); a short gap fixes it.
    if (wasBusy) setTimeout(begin, 80);
    else begin();
  }

  function stopSpeaking() {
    speechToken++;
    clearTimeout(speakTimer);
    if (synth) synth.cancel();
    speaking = false;
    if (suspendedForSpeech) {
      suspendedForSpeech = false;
      if (alwaysOn && !running) startListening();
    }
    idleStatus();
  }

  function setMuted(m) {
    state.muted = m;
    store.set("muted", m);
    muteBtn.textContent = m ? "Voice off" : "Voice on";
    muteBtn.setAttribute("aria-pressed", String(m));
    if (m) stopSpeaking();
  }
  const RATE_STEPS = [0.85, 1.05, 1.25, 1.45];
  function changeRate(dir) {
    let i = RATE_STEPS.findIndex((r) => Math.abs(r - state.rate) < 0.05);
    if (i < 0) i = 1;
    i = Math.max(0, Math.min(RATE_STEPS.length - 1, i + dir));
    state.rate = RATE_STEPS[i];
    store.set("rate", state.rate);
    rateSelect.value = String(state.rate);
    return i;
  }

  /* ==
     PANELS \u2014 what appears on screen for each topic
     == */
  const pill = (text, hit) => `<span class="pill${hit ? " pill--hit" : ""}">${esc(text)}</span>`;
  const bullets = (items) => `<ul class="bullets">${items.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
  const project = (id) => C.projects.find((p) => p.id === id);

  function linkButton(p, highlight) {
    if (!p.link) return "";
    return `<a class="mini-btn mini-btn--primary${highlight ? " mini-btn--hi" : ""}" href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link_label)}</a>`;
  }
  function projectCard(p, detail, highlight) {
    const more = detail ? "" : `<button type="button" class="mini-btn" data-intent="${esc(p.id)}">Hear about ${esc(p.name)}</button>`;
    return `<article class="panel-project${detail ? " panel-project--highlighted" : ""}">
      <span class="panel-project__badge">${esc(p.period)}</span>
      <h3>${esc(p.name)}</h3>
      <p class="panel-project__sub">${esc(p.subtitle)}</p>
      ${detail ? bullets(p.bullets) : ""}
      <div class="panel-pills">${p.stack.map((s) => pill(s)).join("")}</div>
      <div class="panel-project__links">${linkButton(p, highlight)}${more}</div>
    </article>`;
  }
  function contactRow(key, label, value, href, highlight, external) {
    return `<a class="panel-contact__row${highlight === key ? " panel-contact__row--highlighted" : ""}" href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>
      <span class="panel-contact__label">${esc(label)}</span>
      <span class="panel-contact__value">${esc(value)}</span>
    </a>`;
  }

  const HELP_GROUPS = [
    ["Ask about him", ["Tell me about Devesh", "What are his skills?", "Tell me about his experience", "Show me his projects", "Where did he study?", "What certifications does he have?"]],
    ["Go deeper", ["Tell me about Verdant", "Tell me about FocusUp", "Does he know React?", "Tell me more"]],
    ["Reach him", ["Email him", "What's his phone number?", "Open LinkedIn", "Show me his resume"]],
    ["Control me", ["Tell me everything", "Skip", "Go back", "Pause", "Stop", "Speak faster"]],
  ];

  const R = {
    about() {
      return `<div class="panel-about">
          <div class="panel-about__avatar">${esc(P.short_name)}</div>
          <div>
            <h2>${esc(P.name)}</h2>
            <p class="panel-about__tagline">${esc(P.tagline)}</p>
            <p class="panel-about__text">${esc(P.summary)}</p>
          </div>
        </div>
        <div class="facts">${P.facts.map((f) => `<div class="fact"><strong>${esc(f.value)}</strong><span>${esc(f.label)}</span></div>`).join("")}</div>`;
    },
    skills(hit) {
      const hitText = (hit || "").toLowerCase();
      return `<div class="panel-skills">${C.skills.groups
        .map((g) => `<div class="panel-skill-group"><h3>${esc(g.title)}</h3><div class="panel-pills">${g.skills.map((s) => pill(s, hitText && s.toLowerCase() === hitText)).join("")}</div></div>`)
        .join("")}</div>`;
    },
    experience() {
      return C.experience
        .map((e) => `<article class="panel-timeline-item">
            <div class="panel-timeline-item__row"><h3>${esc(e.title)}</h3><span>${esc(e.period)}</span></div>
            <p class="panel-timeline-item__org">${esc(e.org)} \u00b7 ${esc(e.location)}</p>
            ${bullets(e.bullets)}
          </article>`)
        .join("");
    },
    projects() {
      return `<div class="panel-projects">${C.projects.map((p) => projectCard(p, false, false)).join("")}</div>`;
    },
    verdant(highlight) { return `<div class="panel-projects">${projectCard(project("verdant"), true, highlight)}</div>`; },
    focusup(highlight) { return `<div class="panel-projects">${projectCard(project("focusup"), true, highlight)}</div>`; },
    education() {
      const e = C.education;
      return `<article class="panel-timeline-item">
          <div class="panel-timeline-item__row"><h3>${esc(e.degree)}</h3><span>${esc(e.period)}</span></div>
          <p class="panel-timeline-item__org">${esc(e.institution)}</p>
          <p>${esc(e.specialization)}</p>
        </article>
        <div class="facts"><div class="fact"><strong>${esc(e.sgpa)}</strong><span>SGPA</span></div></div>`;
    },
    certifications() {
      const rows = (kind) => C.certifications
        .filter((c) => c.kind === kind)
        .map((c) => `<div class="panel-contact__row"><span class="panel-contact__value">${esc(c.name)}</span><span class="panel-contact__label">${esc(c.detail)}</span></div>`)
        .join("");
      return `<div class="panel-contact">${rows("cert")}</div>
        <p class="panel-subhead">Also on the resume</p>
        <div class="panel-contact">${rows("other")}</div>`;
    },
    interests() {
      return `<div class="panel-skill-group"><h3>Outside of tech</h3><div class="panel-pills">${C.interests.map((i) => pill(i)).join("")}</div></div>`;
    },
    contact(highlight) {
      const li = P.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      return `<div class="panel-contact">
          ${contactRow("email", "Email", P.email, "mailto:" + P.email, highlight, false)}
          ${contactRow("phone", "Phone", P.phone, "tel:" + P.phone_tel, highlight, false)}
          ${contactRow("linkedin", "LinkedIn", li, P.linkedin, highlight, true)}
        </div>`;
    },
    resume() {
      const save = HAS_PDF
        ? `<a class="mini-btn" href="${esc(RESUME_URL)}" download>Download PDF</a>`
        : `<a class="mini-btn" href="/resume.html?print=1" target="_blank" rel="noopener">Save as PDF</a>`;
      return `<div class="panel-resume">
          <p>${HAS_PDF ? "Devesh's resume as a PDF." : "Devesh's full resume on one page \u2014 read it here, or save it as a PDF."}</p>
          <div class="panel-resume__actions">
            <a class="mini-btn mini-btn--primary" href="${esc(RESUME_URL)}" target="_blank" rel="noopener">View resume</a>
            ${save}
          </div>
        </div>`;
    },
    home() {
      const order = ["about", "skills", "experience", "projects", "education", "certifications", "interests", "contact"];
      const cards = order.map((id) => `<button type="button" class="home-card" data-intent="${id}"><strong>${esc(T[id].title)}</strong><span>${esc(T[id].blurb)}</span></button>`);
      cards.push(`<button type="button" class="home-card" data-intent="resume"><strong>Resume</strong><span>View or download the PDF</span></button>`);
      return `<div class="home-grid">${cards.join("")}</div>`;
    },
    help() {
      return HELP_GROUPS.map(
        ([title, phrases]) => `<div class="help-group"><h3>${esc(title)}</h3><div class="help-phrases">${phrases
          .map((p) => `<button type="button" class="chip" data-say="${esc(p)}">${esc(p)}</button>`)
          .join("")}</div></div>`
      ).join("");
    },
  };

  // If the caption (or the tour controls) ended up off-screen, bring it back.
  function keepInView(el) {
    if (!el || el.hidden) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.55) {
      const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.12, behavior: calm ? "auto" : "smooth" });
    }
  }
  function setPanel(html) {
    panelBody.innerHTML = html;
    // Replay the small swap animation so a change of content is noticeable.
    panelBody.classList.remove("swap");
    void panelBody.offsetWidth;
    panelBody.classList.add("swap");
    keepInView(tour.active ? tourBar : captionText);
  }
  function revealPanel() {
    welcomeState.hidden = true;
    responsePanel.hidden = false;
    sectionNav.hidden = false;
    appRoot.classList.add("is-compact"); // smaller mic \u2192 more room for content
  }

  /* -- Section bar (always available) -- */
  const NAV = [
    ["about", "Summary"], ["skills", "Skills"], ["experience", "Experience"], ["projects", "Projects"],
    ["education", "Education"], ["certifications", "Certifications"], ["interests", "Interests"],
    ["contact", "Contact"], ["resume", "Resume"],
  ];
  sectionNav.innerHTML = NAV.map(([id, label]) => `<button type="button" class="nav-pill" data-nav="${id}">${esc(label)}</button>`).join("");
  function setActiveNav(id) {
    const key = id === "verdant" || id === "focusup" ? "projects" : id;
    sectionNav.querySelectorAll(".nav-pill").forEach((b) => b.classList.toggle("is-active", b.dataset.nav === key));
  }

  /* -- Follow-up suggestions under each answer -- */
  const SUGGEST = {
    about: [["Tell me more", "more"], ["His skills", "skills"], ["His projects", "projects"], ["Tell me everything", "tour"]],
    skills: [["Tell me more", "more"], ["His experience", "experience"], ["His projects", "projects"]],
    experience: [["Tell me more", "more"], ["His projects", "projects"], ["His education", "education"]],
    projects: [["Verdant", "verdant"], ["FocusUp", "focusup"], ["Tell me more", "more"]],
    verdant: [["Tell me more", "more"], ["Open Verdant", "open_link"], ["FocusUp", "focusup"]],
    focusup: [["Tell me more", "more"], ["Verdant", "verdant"], ["His education", "education"]],
    education: [["Certifications", "certifications"], ["His experience", "experience"]],
    certifications: [["Interests", "interests"], ["Contact him", "contact"]],
    interests: [["Contact him", "contact"], ["Resume", "resume"]],
    contact: [["Email", "email"], ["Phone", "phone"], ["LinkedIn", "linkedin"], ["Resume", "resume"]],
    resume: [["Contact him", "contact"], ["Tell me everything", "tour"]],
    home: [["Tell me everything", "tour"], ["What can I say?", "help"]],
    help: [["Tell me everything", "tour"]],
  };
  function moreText(id) {
    if (id === "projects") return [T.verdant.voice, T.focusup.voice].join(" ");
    return (T[id] && T[id].more) || "";
  }
  function chipsFor(id) {
    return (SUGGEST[id] || []).filter(([, intent]) => intent !== "more" || moreText(id));
  }
  function setChips(list) {
    chipsEl.innerHTML = (list || [])
      .map(([label, intent]) => `<button type="button" class="chip" data-intent="${esc(intent)}">${esc(label)}</button>`)
      .join("");
  }

  /* ==
     SHOWING TOPICS
     == */
  function rememberTopic(id) {
    state.topic = id;
    if (id === "verdant" || id === "focusup") state.projectId = id;
    setActiveNav(id);
  }

  // depth: "short" (the quick answer) or "full" (answer + all the detail)
  function showTopic(id, depth, highlightLink) {
    revealPanel();
    setPanel(R[id](highlightLink));
    rememberTopic(id);
    setChips(chipsFor(id));
    const text = depth === "full" ? [T[id].voice, moreText(id)].filter(Boolean).join(" ") : T[id].voice;
    speak(text);
  }

  function showResume() {
    revealPanel();
    setPanel(R.resume());
    rememberTopic("resume");
    setChips(SUGGEST.resume);
    speak(`Here's Devesh's resume. You can view it or ${HAS_PDF ? "download the PDF" : "save it as a PDF"} right here.`);
  }

  function showHome(spoken) {
    revealPanel();
    setPanel(R.home());
    state.topic = "home";
    setActiveNav(null);
    setChips(SUGGEST.home);
    speak(spoken || "Here are all the sections.");
  }

  function chooseManual() {
    endTour();
    state.awaiting = null;
    showHome("Great \u2014 take your time. Tap a section, or just ask me about anything on the resume.");
  }

  function showHelp() {
    revealPanel();
    setPanel(R.help());
    state.topic = "help";
    setActiveNav(null);
    setChips(SUGGEST.help);
    speak("You can ask about his skills, experience, projects like Verdant and FocusUp, education, certifications, interests, or how to contact him. Or just tap any phrase on screen.");
  }

  function sayMore() {
    const id = state.topic;
    const text = id ? moreText(id) : "";
    if (!id || id === "home" || id === "help" || id === "resume") {
      speak("Tell me what you'd like more on \u2014 try skills, experience or projects.");
      return;
    }
    if (!text) {
      speak("That's everything I have on that. Try another section, or say tell me everything.");
      return;
    }
    setChips(chipsFor(id).filter(([, intent]) => intent !== "more"));
    speak(text);
  }

  /* -- Skill questions ("does he know React?") -- */
  function answerSkill(hit) {
    revealPanel();
    setPanel(R.skills(hit.pill));
    rememberTopic("skills");
    setChips(chipsFor("skills"));
    speak(`Yes \u2014 ${hit.name} is on Devesh's resume. It's ${hit.where}.${hit.note ? " " + hit.note : ""}`);
  }
  function notOnResume(n) {
    const term = extractSkillTerm(n);
    revealPanel();
    setPanel(R.skills());
    rememberTopic("skills");
    setChips(chipsFor("skills"));
    speak(`I don't see ${term || "that"} on Devesh's resume, and I can only go by what's on it. Here are the skills he lists.`);
  }
  function unknownReply() {
    revealPanel();
    setPanel(R.help());
    state.topic = "help";
    setActiveNav(null);
    setChips(SUGGEST.help);
    speak("Sorry, I only know what's on Devesh's resume. Try asking about his skills, projects, experience, or education.");
  }

  /* -- Contact -- */
  function tryOpen(url) {
    let w = null;
    try { w = window.open(url, "_blank"); } catch (e) { /* blocked */ }
    if (w) { try { w.opener = null; } catch (e) { /* cross-origin */ } return true; }
    return false;
  }
  function showContact(highlight) {
    revealPanel();
    setPanel(R.contact(highlight));
    rememberTopic("contact");
    setChips(chipsFor("contact"));
  }
  function startContactFlow() {
    showContact(null);
    state.awaiting = "contact";
    speak(C.contact_prompt);
  }
  function parseContactMethod(n) {
    if (/\b(all|everything|both|every)\b/.test(n)) return "all";
    if (/\b(email|e-mail|mail|gmail)\b/.test(n)) return "email";
    if (/\b(phone|call|number|mobile|whatsapp|text)\b/.test(n)) return "phone";
    if (/\b(linkedin|linked in|linked-in|dm|message)\b/.test(n)) return "linkedin";
    return null;
  }
  function handleContactAnswer(n) {
    const method = parseContactMethod(n);
    if (!method) return false;
    state.awaiting = null;
    sayContact(method, {});
    return true;
  }
  function sayContact(method, opts) {
    if (method === "all") {
      showContact(null);
      speak(`Here's how to reach Devesh. Email: ${P.email_spoken}. Phone: ${P.phone_spoken}. His LinkedIn is on screen.`, {
        caption: "Email, phone and LinkedIn are all on screen \u2014 tap any of them.",
      });
      return;
    }
    showContact(method);
    if (method === "email") {
      speak(`Devesh's email is ${P.email_spoken}. It's highlighted on screen \u2014 tap it to write to him.`, {
        caption: `Email: ${P.email} \u2014 tap it to write to him.`,
      });
    } else if (method === "phone") {
      speak(`Devesh's phone number is ${P.phone_spoken}. It's highlighted on screen \u2014 tap it to call.`, {
        caption: `Phone: ${P.phone} \u2014 tap it to call.`,
      });
    } else {
      const opened = opts.open ? tryOpen(P.linkedin) : false;
      speak(
        opened
          ? "Opening Devesh's LinkedIn in a new tab."
          : "Here's Devesh's LinkedIn. It's highlighted on screen \u2014 tap it to open.",
      );
    }
  }
  function openLink(n) {
    let target = null;
    if (/verdant|verdent/.test(n)) target = "verdant";
    else if (/focus/.test(n)) target = "focusup";
    else if (/linked/.test(n)) target = "linkedin";
    else if (state.projectId) target = state.projectId;
    else if (state.topic === "contact") target = "linkedin";

    if (!target) { speak("Which link would you like \u2014 Verdant, FocusUp, or LinkedIn?"); return; }
    if (target === "linkedin") { sayContact("linkedin", { open: true }); return; }

    const p = project(target);
    revealPanel();
    setPanel(R[target](true));
    rememberTopic(target);
    setChips(chipsFor(target));
    if (!p.link) { speak(`I don't have a live link for ${p.name} yet.`); return; }
    speak(tryOpen(p.link) ? `Opening ${p.name} in a new tab.` : `Your browser blocked the new tab \u2014 tap the highlighted button to open ${p.name}.`);
  }

  /* ==
     THE FULL WALKTHROUGH ("tell me everything")
     == */
  function updateTourBar() {
    const total = C.tour.length;
    const step = C.tour[tour.index];
    if (!step) return;
    tourProgress.textContent = `Step ${tour.index + 1} of ${total} \u00b7 ${T[step.topic].title}`;
    tourFill.style.width = ((tour.index + 1) / total) * 100 + "%";
    tourPauseBtn.textContent = tour.paused ? "Resume" : "Pause";
    tourBackBtn.disabled = tour.index <= 0;
  }

  function startTour(from) {
    stopSpeaking();
    state.awaiting = null;
    tour.active = true;
    tour.paused = false;
    tour.index = from || 0;
    tour.resumeIndex = -1;
    tourBar.hidden = false;
    runTourStep();
  }

  function runTourStep() {
    const step = C.tour[tour.index];
    if (!step) { finishTour(); return; }
    tour.paused = false;
    const id = step.topic;
    revealPanel();
    setPanel(R[id]());
    rememberTopic(id);
    setChips([]);
    updateTourBar();
    const idx = tour.index;
    const text = [step.intro, T[id].voice, moreText(id), step.outro].filter(Boolean).join(" ");
    speak(text, {
      onEnd: () => {
        if (tour.active && !tour.paused && tour.index === idx) { tour.index++; runTourStep(); }
      },
    });
  }

  function finishTour() {
    tour.active = false;
    tour.paused = false;
    tour.index = -1;
    tour.resumeIndex = -1;
    tourBar.hidden = true;
    state.topic = "contact";
    setChips(chipsFor("contact"));
    idleStatus();
  }
  function endTour() {
    if (tour.active) tour.resumeIndex = tour.index; // so "continue" can pick it back up
    tour.active = false;
    tour.paused = false;
    tourBar.hidden = true;
  }
  function tourNext() {
    stopSpeaking();
    if (tour.index + 1 >= C.tour.length) {
      finishTour();
      captionText.textContent = "That's the end of the walkthrough. Ask me anything else.";
      return;
    }
    tour.index++;
    runTourStep();
  }
  function tourPrev() {
    stopSpeaking();
    tour.index = Math.max(0, tour.index - 1);
    runTourStep();
  }
  function tourPause() {
    tour.paused = true;
    stopSpeaking();
    updateTourBar();
    captionText.textContent = "Paused \u2014 say \u201ccontinue\u201d, or tap Resume.";
  }
  function tourResume() {
    stopSpeaking();
    runTourStep(); // re-reads the current section from its start
  }
  function stopEverything() {
    endTour();
    stopSpeaking();
    state.awaiting = null;
    captionText.textContent = "Okay \u2014 stopped. Ask me anything, or tap a section.";
  }

  /* ==
     COMMAND ROUTER \u2014 one place that every input ends up in
     (voice, typing, taps on chips and the section bar)
     == */
  const TOPIC_INTENTS = new Set(["about", "skills", "experience", "projects", "verdant", "focusup", "education", "certifications", "interests"]);
  const TOUR_CONTROLS = new Set(["skip", "back", "pause", "continue", "stop", "repeat", "mute", "unmute", "faster", "slower"]);

  function audioCommand(intent, quiet) {
    if (intent === "mute") {
      setMuted(true);
      captionText.textContent = "Voice is off \u2014 I'll show answers on screen. Say \u201cunmute\u201d to hear me again.";
    } else if (intent === "unmute") {
      setMuted(false);
      if (!quiet) speak("Voice is back on.");
    } else if (intent === "faster") {
      const i = changeRate(1);
      if (!quiet) speak(i >= RATE_STEPS.length - 1 ? "That's as fast as I go." : "Okay, a little faster.");
    } else if (intent === "slower") {
      const i = changeRate(-1);
      if (!quiet) speak(i <= 0 ? "That's as slow as I go." : "Okay, a little slower.");
    }
  }

  function runCommand(intent, ctx) {
    ctx = ctx || {};
    const n = ctx.normalized || "";
    const wantsMore = /\b(more|details?|detailed|in depth|elaborate|deeper)\b/.test(n);

    if (tour.active) {
      switch (intent) {
        case "skip": return tourNext();
        case "back": return tourPrev();
        case "pause": return tourPause();
        case "continue": return tourResume();
        case "resume": if (tour.paused) return tourResume(); break;
        case "stop": return stopEverything();
        case "repeat": return tourResume();
        case "mute": case "unmute": case "faster": case "slower":
          audioCommand(intent, true);
          return tourResume();
        case "thanks": case "greet": return undefined;
        default: break;
      }
      endTour(); // any other request leaves the walkthrough
    }

    if (TOPIC_INTENTS.has(intent)) return showTopic(intent, wantsMore && intent !== "projects" ? "full" : "short");

    switch (intent) {
      case "tour": return startTour(0);
      case "manual": return chooseManual();
      case "home": return showHome();
      case "contact": return startContactFlow();
      case "email": return sayContact("email", {});
      case "phone": return sayContact("phone", {});
      case "linkedin": return sayContact("linkedin", { open: /\b(open|visit|launch|go to)\b/.test(n) });
      case "resume": return showResume();
      case "open_link": return openLink(n);
      case "more": return sayMore();
      case "back": return state.topic && state.topic !== "home" ? showHome() : speak("You're already at the start.");
      case "skip": return speak("There's nothing to skip right now \u2014 try \u201ctell me everything\u201d for the full walkthrough.");
      case "continue":
        if (tour.resumeIndex >= 0) return startTour(tour.resumeIndex);
        return sayMore();
      case "pause": case "stop": return stopEverything();
      case "repeat": return speak(lastSpoken || "I haven't said anything yet.");
      case "help": return showHelp();
      case "mute": case "unmute": case "faster": case "slower": return audioCommand(intent, false);
      case "thanks": return speak("You're welcome!");
      case "greet": return speak("Hi! Ask me anything about Devesh \u2014 his skills, projects, experience, or say tell me everything.");
      default: return unknownReply();
    }
  }

  /* ==
     UNDERSTANDING WHAT WAS SAID
     == */
  function showChooser() {
    welcomeState.hidden = false;
    responsePanel.hidden = true;
    sectionNav.hidden = true;
    appRoot.classList.remove("is-compact");
    state.awaiting = "mode";
    speak(C.greeting);
  }

  async function routeViaAI(raw, n, weakIntent, ctx) {
    const mySeq = ++aiSeq;
    const fallback = () => (weakIntent ? runCommand(weakIntent, ctx) : unknownReply());
    if (C.ai_enabled === false) return fallback(); // static deployment: no server to ask
    setStatus("processing");
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: raw }),
      });
      const data = await res.json();
      if (mySeq !== aiSeq) return; // something newer was said meanwhile
      idleStatus();
      if (data.ai_available === false) {
        // Developer hint: only ever shown when running on your own machine.
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
          aiStatusNote.textContent = "Tip: add an ANTHROPIC_API_KEY to help MINIme understand less direct phrasing \u2014 see the README.";
        }
        return fallback();
      }
      if (data.intent && data.intent !== "unknown") return runCommand(data.intent, ctx);
      return unknownReply();
    } catch (e) {
      if (mySeq !== aiSeq) return;
      idleStatus();
      return fallback();
    }
  }

  function acknowledge() {
    speak("Yes?");
  }

  // source: "voice" | "typed" | "ui"
  function handleTranscript(rawInput, opts) {
    const source = (opts && opts.source) || "voice";
    const raw = (rawInput || "").trim();
    if (!raw) return;

    const m = matchIntent(raw);
    const wake = hasWake(raw);
    const n = m.normalized;
    const skill = findSkill(n);
    const skillQ = !!skill && isSkillQuestion(n);

    // With the mic always open, ignore room chatter: act only on clear
    // commands, generic words only mid-conversation, anything after "Hey MINIme".
    if (source === "voice" && alwaysOn && !wake && !state.awaiting) {
      const inConversation = tour.active || speaking || Date.now() - lastSpeechEnd < 20000;
      const okIntent = m.strong && (!CONTEXTUAL_INTENTS.has(m.intent) || inConversation);
      const skillMiss = isSkillQuestion(n) && !!extractSkillTerm(n) && /\b(he|his|him|devesh)\b|^(do|does|can) you\b/.test(n);
      if (!okIntent && !skillQ && !skillMiss) {
        transcriptEl.classList.add("is-live");
        transcriptEl.textContent = "\u201c" + raw + "\u201d \u2014 say \u201cHey MINIme\u201d first if that was for me";
        return;
      }
    }

    showTranscript(raw);
    stopSpeaking(); // barge-in: new input always interrupts MINIme

    // Anything that isn't a tour control pauses a running walkthrough.
    if (tour.active) {
      const isControl = m.strong && TOUR_CONTROLS.has(m.intent);
      if (!isControl) { tour.paused = true; updateTourBar(); }
    }

    // Just "Hey MINIme".
    if (!n) { acknowledge(); return; }

    const ctx = { normalized: n, raw, source };

    // She asked "explore, or tell you everything?"
    if (state.awaiting === "mode") {
      if (m.strong && m.intent === "manual") return chooseManual();
      if (m.strong && m.intent === "tour") return startTour(0);
      if (!m.strong) {
        const answer = parseModeAnswer(raw);
        if (answer === "manual") return chooseManual();
        if (answer === "tour") return startTour(0);
        if (!skill) {
          speak("Sorry, I didn't catch that. Would you like to explore yourself, or should I tell you everything?");
          return;
        }
      }
      if (m.strong && !CONTEXTUAL_INTENTS.has(m.intent)) state.awaiting = null; // they went straight to a topic
    }

    // She asked "email, phone, or LinkedIn?"
    if (state.awaiting === "contact") {
      if (handleContactAnswer(n)) return;
      state.awaiting = null;
    }

    // "Does he know React?" / "tell me about Python"
    if (skill && (!m.strong || m.intent === "skills") && (skillQ || !m.confident)) return answerSkill(skill);

    if (m.confident) return runCommand(m.intent, ctx);

    if (isSkillQuestion(n) && extractSkillTerm(n)) return notOnResume(n);

    return routeViaAI(raw, n, m.intent, ctx);
  }

  /* ==
     LISTENING \u2014 the mic stays open after the first tap
     == */
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startListening() {
    if (!recognition) return;
    alwaysOn = true;
    clearTimeout(restartTimer);
    // Phones: wait until she has finished talking; finish() re-opens the mic.
    if (IS_MOBILE && speaking) { suspendedForSpeech = true; return; }
    if (running) { if (state.current === "idle") setStatus("listening"); return; }
    try {
      recognition.start();
      running = true;
      heardSomething = false;
      if (state.current === "idle") setStatus("listening");
    } catch (e) {
      restartTimer = setTimeout(startListening, 300); // previous session still closing
    }
  }

  function stopListening() {
    alwaysOn = false;
    suspendedForSpeech = false;
    clearTimeout(restartTimer);
    clearTimeout(interimTimer);
    if (recognition) { try { recognition.abort(); } catch (e) { /* already closed */ } }
    running = false;
    if (state.current === "listening") setStatus("idle");
  }

  // While she's talking (or has only just finished), her own voice can leak
  // back into the mic. Only controls like "stop"/"skip", or "Hey MINIme",
  // are accepted during that window.
  function acceptable(text) {
    const m = matchIntent(text);
    const justSpoke = Date.now() - lastSpeechEnd < 700;
    if (speaking || justSpoke) return hasWake(text) || (m.strong && TOUR_CONTROLS.has(m.intent));
    return true;
  }

  // Fast path: once a clear command has been spoken and the words stop
  // changing for a moment, act on it without waiting for the browser to
  // decide you've finished speaking.
  function scheduleFastCommit(text) {
    clearTimeout(interimTimer);
    interimTimer = setTimeout(() => {
      if (committed || !running) return;
      const m = matchIntent(text);
      if (!(m.strong && m.normalized && acceptable(text))) return;
      committed = true;
      try { recognition.abort(); } catch (e) { /* already closed */ }
      handleTranscript(text, { source: "voice" });
    }, 650);
  }

  if (SpeechRecognitionCtor) {
    recognition = new SpeechRecognitionCtor();
    recognition.lang = REC_LANG;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { committed = false; heardSomething = false; };

    recognition.onresult = (event) => {
      errorStreak = 0;
      heardSomething = true;
      const res = event.results[event.results.length - 1];
      const text = res[0].transcript;
      if (!res.isFinal) {
        if (!committed && acceptable(text)) { showLive(text); scheduleFastCommit(text); }
        return;
      }
      clearTimeout(interimTimer);
      if (committed) return;
      committed = true;
      if (!acceptable(text)) return;
      handleTranscript(text, { source: "voice" });
    };

    recognition.onerror = (event) => {
      running = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        alwaysOn = false;
        setStatus("idle");
        micStatus.textContent = "Microphone access denied \u2014 check your browser permissions.";
        return;
      }
      if (event.error === "network") {
        errorStreak++;
        if (errorStreak >= 3) {
          alwaysOn = false;
          setStatus("idle");
          micStatus.textContent = "Voice service unreachable \u2014 tap the mic to retry, or type.";
        }
      }
      // "no-speech" / "aborted": onend fires next and the mic reopens.
    };

    recognition.onend = () => {
      running = false;
      clearTimeout(interimTimer);
      if (!alwaysOn) { if (state.current === "listening") setStatus("idle"); return; }
      if (suspendedForSpeech) return; // finish() reopens the mic after she speaks
      if (RESTART_ON_SILENCE || heardSomething) {
        restartTimer = setTimeout(startListening, 250 + errorStreak * 500);
        return;
      }
      alwaysOn = false; // phones: nothing heard \u2192 back to tap-to-talk
      setStatus("idle");
    };

    // Tap the mic: interrupts her if she's talking, otherwise toggles listening.
    micBtn.addEventListener("click", () => {
      if (speaking) {
        if (tour.active && !tour.paused) tourPause();
        else stopSpeaking();
        startListening();
        return;
      }
      if (alwaysOn) stopListening();
      else startListening();
    });
  } else {
    micFallback.hidden = false;
    micBtn.disabled = true;
    micStatus.textContent = "Voice not supported here";
    typeForm.hidden = false;
    typeToggle.hidden = true;
  }

  /* ==
     WIRING \u2014 buttons, chips, section bar, typing, keyboard
     == */
  function uiCommand(intent) {
    stopSpeaking();
    runCommand(intent, { normalized: "", source: "ui" });
  }

  // One delegated handler covers section-bar pills, chips and cards.
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-intent],[data-say],[data-nav]");
    if (!el || !appRoot.contains(el)) return;
    if (el.dataset.say) { handleTranscript(el.dataset.say, { source: "ui" }); return; }
    uiCommand(el.dataset.intent || el.dataset.nav);
  });

  choiceExplore.addEventListener("click", () => { stopSpeaking(); chooseManual(); });
  choiceTour.addEventListener("click", () => startTour(0));

  tourBackBtn.addEventListener("click", tourPrev);
  tourSkipBtn.addEventListener("click", tourNext);
  tourStopBtn.addEventListener("click", stopEverything);
  tourPauseBtn.addEventListener("click", () => (tour.paused ? tourResume() : tourPause()));

  typeToggle.addEventListener("click", () => {
    typeForm.hidden = !typeForm.hidden;
    if (!typeForm.hidden) typeInput.focus();
  });
  typeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = typeInput.value.trim();
    typeInput.value = "";
    if (value) handleTranscript(value, { source: "typed" });
  });

  muteBtn.addEventListener("click", () => {
    setMuted(!state.muted);
    if (!state.muted) speak("Voice is back on.");
    else captionText.textContent = "Voice is off \u2014 I'll show answers on screen.";
  });
  voiceSelect.addEventListener("change", () => {
    state.voiceName = voiceSelect.value;
    store.set("voice", state.voiceName);
    loadVoices();
    speak("Hi, I'm MINIme. This is how I sound.");
  });
  rateSelect.addEventListener("change", () => {
    state.rate = Number(rateSelect.value) || 1.05;
    store.set("rate", state.rate);
    speak("This is how fast I'll speak.");
  });

  document.addEventListener("keydown", (e) => {
    if (appRoot.hidden) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (e.key === "Escape") { stopEverything(); return; }
    if (e.code === "Space" && !/INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY|A/.test(tag)) {
      e.preventDefault();
      micBtn.click();
    }
  });

  // Coming back to the tab: make sure the mic is open again.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && alwaysOn && !running && !speaking) startListening();
  });

  /* -- Start-up -- */
  if (!RATE_STEPS.some((r) => Math.abs(r - state.rate) < 0.01)) state.rate = 1.05;
  rateSelect.value = String(state.rate);
  setMuted(state.muted);
  setActiveNav(null);

  /* -- Gate hand-off -- */
  // Called by gate.js once the visitor has said or typed something on the
  // gate screen. A bare "Hey MINIme" leads to the "explore or tell me
  // everything?" question; a real command ("hey MINIme, show me your
  // projects") is acted on straight away so nobody has to repeat themselves.
  window.unlockApp = function unlockApp(pending, viaVoice) {
    const gate = $("gateScreen");
    gate.hidden = true;
    gate.style.display = "none";
    appRoot.hidden = false;

    const m = pending ? matchIntent(pending) : null;
    const hasCommand =
      !!m && !!m.normalized &&
      ((m.confident && !CONTEXTUAL_INTENTS.has(m.intent)) || !!findSkill(m.normalized));

    if (hasCommand) handleTranscript(pending, { source: "typed" });
    else showChooser();

    // Keep the mic open from here on, so no more tapping is needed.
    if (viaVoice && recognition) setTimeout(startListening, 400);
  };
})();