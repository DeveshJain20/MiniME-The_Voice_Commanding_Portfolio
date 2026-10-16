/* --
   INTENT MATCHING  (runs locally, instantly, before any AI call)

   Each intent can define:
     phrases  \u2013 matched anywhere in the sentence (whole words)
     short    \u2013 matched only when the sentence is 4 words or fewer
                (so "stop" or "next" work, but "what's next on his
                list of projects" doesn't trigger a control command)
     keywords \u2013 single words / word stems used as a looser fallback

   Phrase matches are "strong"; keyword-only matches are weaker and the
   caller may double-check them with the AI fallback.
   -- */

const WAKE_PREFIXES = [
  /^(hey|hi|hello|ok|okay)\s+(mini\s*me|minnie|mini\s*mi|many\s*me|mini)\b\s*/,
  /^(mini\s*me|minnie|mini\s*mi|mini)\b\s*/,
];

const FILLER_PREFIX = /^(please|ok|okay|so|um|uh|well|and|now|then)\s+/;
const FILLER_SUFFIX = /\s+please$/;

function cleanText(raw) {
  return (raw || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.,!?;:"()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWake(raw) {
  const t = cleanText(raw);
  return WAKE_PREFIXES.some((re) => re.test(t));
}

function normalizeTranscript(raw) {
  let text = cleanText(raw);
  for (let i = 0; i < 2; i++) {
    for (const re of WAKE_PREFIXES) text = text.replace(re, "").trim();
    text = text.replace(FILLER_PREFIX, "").trim();
  }
  return text.replace(FILLER_SUFFIX, "").trim();
}

// Generic words ("back", "more", "hello"...) are easy to say by accident in
// a room. They only count when MINIme is mid-conversation (she's talking,
// a tour is running, or she spoke within the last ~20 seconds) or when the
// visitor says "Hey MINIme" first.
const CONTEXTUAL_INTENTS = new Set([
  "greet", "thanks", "home", "back", "more", "pause", "continue", "skip", "repeat",
  "stop", "faster", "slower", "mute", "unmute", "help",
]);

const INTENTS = [
  /* -- controls (listed first so they win ties) -- */
  { id: "stop", short: ["stop", "stop talking", "cancel", "never mind", "nevermind", "enough", "that's enough", "be quiet", "quiet", "that's all", "silence"] },
  { id: "pause", short: ["pause", "hold on", "wait", "wait a second", "one moment", "just a moment", "hang on"] },
  { id: "continue", short: ["continue", "keep going", "go on", "carry on", "go ahead", "proceed", "resume tour", "resume the tour", "continue the tour", "resume walkthrough"] },
  { id: "skip", short: ["skip", "skip this", "skip ahead", "next", "next one", "next section", "move on", "go next", "skip section"] },
  { id: "back", short: ["back", "go back", "previous", "previous one", "previous section", "last one", "go to previous"] },
  { id: "repeat", short: ["repeat", "repeat that", "say that again", "say again", "again", "pardon", "what did you say", "come again"] },
  { id: "more", short: ["more", "tell me more", "more details", "more detail", "details", "go deeper", "elaborate", "say more", "explain more", "what else", "in detail", "expand on that", "tell me more about that"] },
  { id: "help", phrases: ["what can i say", "what can i ask", "what can you do", "what should i ask", "show commands", "how does this work", "how do i use this", "how do i use you", "instructions"], short: ["help", "commands", "options"] },
  { id: "unmute", phrases: ["turn on voice", "turn on the voice", "voice on", "start talking", "speak again"], short: ["unmute"] },
  { id: "mute", phrases: ["mute voice", "voice off", "turn off voice", "turn off the voice", "text only", "don't speak", "do not speak"], short: ["mute"] },
  { id: "faster", phrases: ["speak faster", "talk faster", "speed up", "a bit faster", "go faster", "too slow"], short: ["faster"] },
  { id: "slower", phrases: ["speak slower", "talk slower", "slow down", "a bit slower", "go slower", "too fast"], short: ["slower"] },
  { id: "thanks", short: ["thanks", "thank you", "thanks a lot", "thank you so much", "appreciate it", "thanks minime"] },
  { id: "greet", short: ["hello", "hi", "hey", "hello there", "hi there", "good morning", "good afternoon", "good evening", "namaste"] },
  { id: "home", short: ["home", "menu", "main menu", "go home", "sections", "show sections", "show menu", "all sections", "back to menu", "start over"] },

  /* -- how to explore -- */
  {
    id: "manual",
    phrases: ["explore myself", "i'll explore", "i will explore", "let me explore", "by myself", "on my own", "i'll look myself", "let me browse", "let me look"],
    short: ["explore", "manual", "manually", "browse", "i'll explore", "explore it", "explore on my own"],
  },
  {
    id: "tour",
    phrases: [
      "tell me everything", "tell us everything", "walk me through everything", "walk me through his resume",
      "walk me through the resume", "walk me through your whole portfolio", "walk me through his whole portfolio",
      "walk me through your portfolio", "walk me through", "give me a full tour", "give me a tour", "full tour",
      "start the tour", "the tour", "show me everything", "read everything", "read the whole resume",
      "read his resume", "read me the resume", "whole resume", "entire resume", "everything about him",
      "everything on his resume", "everything on the resume", "full walkthrough", "you tell me", "you explain",
      "narrate", "read it out", "read it to me",
    ],
  },

  /* -- contact actions -- */
  {
    id: "open_link",
    phrases: [
      "open the link", "open link", "open the project", "open it", "open that", "open the website", "open website",
      "visit the website", "visit website", "open the site", "show me the link", "open the demo", "live demo",
      "open demo", "visit it", "launch it", "go to the website", "open verdant", "visit verdant", "launch verdant",
      "verdant website", "verdant link", "open focusup", "open focus up", "focusup demo", "focus up demo",
    ],
  },
  { id: "email", phrases: ["email him", "his email", "email address", "his email address", "mail him", "send an email", "send him an email", "e-mail", "gmail"], short: ["email"], keywords: ["email", "gmail"] },
  { id: "phone", phrases: ["phone number", "his number", "his phone", "contact number", "mobile number", "call him", "whatsapp"], short: ["phone"], keywords: ["phone", "mobile", "whatsapp"] },
  { id: "linkedin", phrases: ["open linkedin", "his linkedin", "linkedin profile", "linked in", "linked-in"], short: ["linkedin"], keywords: ["linkedin"] },
  { id: "resume", phrases: ["show me his resume", "show me your resume", "can i see his resume", "can i see your resume", "download resume", "download the resume", "download his resume", "his resume", "your resume", "his cv", "your cv"], short: ["resume", "cv", "pdf", "the resume"], keywords: ["resume", "cv"] },
  {
    id: "contact",
    phrases: [
      "i want to contact him", "i want to contact you", "how can i contact him", "how do i contact him",
      "how can i contact you", "how do i contact you", "get in touch", "reach him", "reach out", "reach you",
      "i want to hire", "hire him", "hire you", "contact him", "contact you", "talk to him", "message him", "connect with him",
    ],
    short: ["contact", "contact details", "contact info"],
    keywords: ["contact", "hire", "reach"],
  },

  /* -- resume sections -- */
  {
    id: "about",
    phrases: [
      "tell me about yourself", "tell me about him", "tell me about devesh", "about devesh", "who is devesh",
      "who is he", "who are you", "introduce yourself", "introduce him", "about him", "about you",
      "his summary", "his profile", "his bio", "his introduction",
    ],
    short: ["summary", "overview", "profile", "bio", "introduction", "who is he"],
    keywords: ["summar", "overview", "introduc", "profile"],
  },
  {
    id: "skills",
    phrases: [
      "what are his skills", "what are your skills", "what skills does he have", "what skills do you have",
      "what can he do", "what does he know", "what technologies", "tech stack", "his skills", "your skills",
      "programming languages", "languages he knows", "tools he uses", "tech he uses", "his technologies",
    ],
    short: ["skills", "skill", "technologies"],
    keywords: ["skill", "technolog", "stack", "language", "framework", "proficien", "expertise"],
  },
  {
    id: "experience",
    phrases: [
      "tell me about his experience", "walk me through his experience", "walk me through your experience",
      "work experience", "work history", "his experience", "your experience", "his internship", "your internship",
      "professional experience", "where did he work", "where has he worked", "where does he work", "inamigos",
      "in amigos", "amigos foundation",
    ],
    short: ["experience", "internship", "intern"],
    keywords: ["experience", "intern", "inamigos", "amigos", "employ", "career", "worked", "job", "company"],
  },
  {
    id: "projects",
    phrases: [
      "show me your projects", "show me his projects", "walk me through your projects", "walk me through his projects",
      "what has he built", "what have you built", "what did he build", "what did he make", "what has he made",
      "his projects", "your projects", "show me his work", "show me your work", "his work", "your work",
    ],
    short: ["projects", "project"],
    keywords: ["project", "built"],
  },
  {
    id: "verdant",
    phrases: [
      "tell me about verdant", "verdant", "verdent", "plant care", "plant-care", "plantnet", "plant app",
      "plant project", "plant platform", "first project", "latest project", "current project", "main project",
      "biggest project", "plant disease",
    ],
    keywords: ["verdant", "verdent", "plant"],
  },
  {
    id: "focusup",
    phrases: [
      "tell me about focusup", "focusup", "focus up", "focus app", "study app", "study productivity",
      "productivity app", "second project", "study session", "study tracker",
    ],
    keywords: ["focusup", "focus"],
  },
  {
    id: "education",
    phrases: [
      "where did he study", "where does he study", "what did he study", "what is he studying", "where do you study",
      "when does he graduate", "when will he graduate", "his education", "your education", "his degree", "his grades",
      "his sgpa", "his cgpa", "cyber security", "cybersecurity", "specialization", "specialisation",
    ],
    short: ["education", "college", "university", "degree", "graduation", "sgpa", "cgpa", "gpa", "grades", "marks", "studies"],
    keywords: ["educat", "universit", "college", "degree", "bachelor", "gradua", "sgpa", "cgpa", "gpa", "grade", "studied", "studying", "academic", "specializ"],
  },
  {
    id: "certifications",
    phrases: [
      "what certifications does he have", "his certifications", "is he certified", "certified ethical hacker",
      "aws cloud practitioner", "smart india hackathon", "ethical hacker", "try hack me", "tryhackme", "hackathon",
    ],
    short: ["certifications", "certification", "certificates", "certificate", "certified", "ceh", "cscu", "nptel", "badges", "courses", "sih", "achievements", "awards"],
    keywords: ["certif", "hackathon", "nptel", "tryhackme", "badge", "achiev", "award"],
  },
  {
    id: "interests",
    phrases: [
      "his interests", "your interests", "what does he like", "what does he do for fun", "free time",
      "outside of work", "outside work", "what are his hobbies", "his hobbies",
    ],
    short: ["interests", "interest", "hobbies", "hobby", "passions"],
    keywords: ["interest", "hobb", "leisure", "travel", "cook", "passion", "fun"],
  },
];

/* -- matching -- */
const _phraseRe = {};
function containsPhrase(text, phrase) {
  let re = _phraseRe[phrase];
  if (!re) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = _phraseRe[phrase] = new RegExp("(^|[^a-z0-9'])" + esc + "($|[^a-z0-9'])");
  }
  return re.test(text);
}

function tokenHit(tokens, kw) {
  if (kw.length >= 5) {
    for (const t of tokens) if (t.startsWith(kw)) return true;
    return false;
  }
  return tokens.has(kw);
}

/**
 * Returns { intent, strong, confident, normalized }
 *  strong     \u2013 a whole phrase matched (safe to act on immediately)
 *  confident  \u2013 strong, or a single clear keyword winner
 *  intent     \u2013 best guess (may be set even when not confident)
 */
function matchIntent(raw) {
  const text = normalizeTranscript(raw);
  if (!text) return { intent: null, strong: false, confident: false, normalized: "" };

  const wordList = text.split(" ");
  const tokens = new Set(wordList);
  const short = wordList.length <= 4;

  let best = { id: null, score: 0, strong: false };
  let second = 0;

  for (const def of INTENTS) {
    let score = 0;
    let strong = false;

    for (const p of def.phrases || []) {
      if (containsPhrase(text, p)) { score = Math.max(score, 100 + p.length); strong = true; }
    }
    if (short) {
      for (const p of def.short || []) {
        if (containsPhrase(text, p)) { score = Math.max(score, 100 + p.length); strong = true; }
      }
    }
    if (!strong && def.keywords) {
      let hits = 0;
      for (const kw of def.keywords) if (tokenHit(tokens, kw)) hits++;
      score = hits * 10;
    }

    if (score > best.score) {
      second = best.score;
      best = { id: def.id, score, strong };
    } else if (score > second) {
      second = score;
    }
  }

  if (!best.id) return { intent: null, strong: false, confident: false, normalized: text };
  const confident = best.strong || (best.score >= 10 && best.score > second);
  return { intent: best.id, strong: best.strong, confident, normalized: text };
}

/* -- "does he know X?" skill lookups -- */
// [display name, where it's listed, aliases, pill text on the Skills panel, extra note]
const TECH = "listed under technical skills";
const ANALYTICAL = "listed under analytical skills";
const SOFT = "listed under business and soft skills";
const INTERN = "something he used during his internship at InAmigos Foundation";
const SKILL_INDEX = [
  ["Python", TECH, ["python"], "Python", "It's the language behind Verdant's FastAPI backend."],
  ["C++", TECH, ["c++", "c plus plus", "see plus plus", "cpp"], "C++", "He uses it for data structures and algorithms."],
  ["JavaScript", TECH, ["javascript", "java script", "js"], "JavaScript", "It sits underneath his React and Next.js work."],
  ["SQL", TECH, ["sql", "sequel"], "SQL", ""],
  ["FastAPI", TECH, ["fastapi", "fast api"], "FastAPI", "It powers Verdant's backend."],
  ["SQLAlchemy", TECH, ["sqlalchemy", "sql alchemy"], "SQLAlchemy", "He used it in Verdant."],
  ["PostgreSQL", TECH, ["postgresql", "postgres", "postgre sql", "post gress"], "PostgreSQL", "Verdant runs on PostgreSQL hosted on Neon."],
  ["React", TECH, ["react", "reactjs", "react js"], "React", "He built FocusUp with it."],
  ["Next.js", TECH, ["nextjs", "next js"], "Next.js", "He built FocusUp with it."],
  ["Tailwind CSS", TECH, ["tailwind", "tailwind css"], "Tailwind CSS", "He used it for FocusUp's responsive interface."],
  ["GSAP", TECH, ["gsap", "g sap"], "GSAP", "He used it for animations on Verdant's marketing site."],
  ["REST APIs", TECH, ["rest api", "rest apis", "restful", "rest"], "REST APIs", "Verdant has a five-endpoint JSON REST API."],
  ["JWT authentication", TECH, ["jwt", "j w t", "json web token", "json web tokens"], "JWT Authentication", "He used it in Verdant."],
  ["Ethical hacking", TECH, ["ethical hacking", "hacking", "cyber security", "cybersecurity", "penetration testing"], "Ethical Hacking (CEH)", "He's also a Certified Ethical Hacker."],
  ["Git", TECH, ["git"], "Git", ""],
  ["GitHub", TECH, ["github", "git hub"], "GitHub", ""],
  ["AWS", TECH, ["aws", "amazon web services", "cloud"], "AWS", "He also holds the AWS Cloud Practitioner certification."],
  ["Render", TECH, ["render"], "Render", "Verdant is deployed there."],
  ["Vercel", TECH, ["vercel"], "Vercel", "FocusUp is deployed there."],
  ["Data structures and algorithms", ANALYTICAL, ["data structures", "algorithms", "algorithm", "dsa"], "Data Structures & Algorithms (C++)", "He practises them in C++."],
  ["Data analysis", ANALYTICAL, ["data analysis", "data analytics", "analytics"], "Data Analysis", "He also completed an NPTEL course in it."],
  ["Data-driven decision making", ANALYTICAL, ["decision making", "data driven"], "Data-Driven Decision Making", ""],
  ["Problem-solving", ANALYTICAL, ["problem solving", "problem solver"], "Problem-Solving", ""],
  ["Debugging", ANALYTICAL, ["debugging", "debug"], "Debugging", ""],
  ["LLM integration", ANALYTICAL, ["llm", "llms", "large language model", "groq", "llama", "gen ai", "generative ai", "ai", "artificial intelligence"], "LLM Integration (Groq, Llama 3.3 70B)", "Verdant uses Groq's Llama 3.3 70B for plant health analysis."],
  ["API integration", ANALYTICAL, ["api integration", "api", "apis"], "API Integration (PlantNet, Razorpay)", ""],
  ["PlantNet", ANALYTICAL, ["plantnet", "plant net"], "API Integration (PlantNet, Razorpay)", "Verdant uses it for plant species identification."],
  ["Razorpay", ANALYTICAL, ["razorpay", "razor pay"], "API Integration (PlantNet, Razorpay)", "Verdant uses it for subscriptions, in test mode."],
  ["Critical thinking", SOFT, ["critical thinking"], "Critical Thinking", ""],
  ["Communication", SOFT, ["communication", "communicate"], "Communication", ""],
  ["Presentation", SOFT, ["presentation", "presenting"], "Presentation", ""],
  ["Adaptability", SOFT, ["adaptability", "adaptable"], "Adaptability", ""],
  ["Team collaboration", SOFT, ["team collaboration", "teamwork", "team work", "collaboration"], "Team Collaboration", ""],
  ["Quick learning", SOFT, ["quick learner", "fast learner", "quick learning"], "Quick Learner", ""],
  ["Windsurf", INTERN, ["windsurf", "wind surf"], null, ""],
  ["Google BigQuery", INTERN, ["bigquery", "big query"], null, ""],
  ["MCP", INTERN, ["mcp", "model context protocol"], null, "He built an MCP-powered analytics assistant there."],
];

function _squash(s) { return s.replace(/[^a-z0-9+#]/g, ""); }

function findSkill(normalized) {
  if (!normalized) return null;
  const tokens = new Set(normalized.split(" "));
  const squashed = _squash(normalized);
  let best = null;
  let bestLen = 0;
  for (const [name, where, aliases, pill, note] of SKILL_INDEX) {
    for (const alias of aliases) {
      const hit = alias.includes(" ") ? squashed.includes(_squash(alias)) : tokens.has(alias);
      if (hit && alias.length > bestLen) {
        best = { name, where, pill, note };
        bestLen = alias.length;
      }
    }
  }
  return best;
}

const SKILL_QUESTION = /\b(know|knows|knowledge|use|uses|used|using|familiar|proficient|proficiency|skilled|expertise|experience (?:with|in)|work(?:s|ed)? with|comfortable|good at|good with|have|has)\b/;

function isSkillQuestion(normalized) {
  return SKILL_QUESTION.test(normalized);
}

// For "does he know Rust?" \u2192 "rust"
function extractSkillTerm(normalized) {
  const m = normalized.match(/\b(?:know|knows|use|uses|using|familiar with|experience (?:with|in)|work(?:s|ed)? with|proficient in|skilled in|good at|knowledge of)\s+(?:about\s+|of\s+|in\s+|with\s+)?(.+)$/);
  return m ? m[1].replace(/^(the|a|an)\s+/, "").trim() : "";
}

/* -- answering "explore or tell me everything?" -- */
function parseModeAnswer(raw) {
  const t = normalizeTranscript(raw);
  if (!t) return null;
  if (/\b(explore|manual|manually|myself|my own|browse|by myself|look around|i will|i'll|on my own)\b/.test(t)) return "manual";
  if (/\b(everything|all of it|whole|full|walk|tell me|you tell|narrate|guide|tour|read|go ahead|start|yes|yeah|yep|sure|okay|ok|please|you)\b/.test(t)) return "tour";
  return null;
}