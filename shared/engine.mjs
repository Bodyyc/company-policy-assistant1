// @ts-nocheck
/**
 * Policy lab engine: rules search, TF-IDF vector index, and an evidence audit.
 * Shared by the website server and the local Slack bot. No network calls.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @typedef {{ id: string, title: string, department: string, category: string, text: string }} Policy */
/** @typedef {{ id: string, title: string, score: number, text: string, category: string }} Hit */
/** @typedef {{ answer: string, policyId: string | null, policyTitle: string | null, abstained: boolean, hits: Hit[] }} LocalAnswer */
/** @typedef {{ unsupported: number, band: "Low" | "Medium" | "High", notes: string[] }} Audit */

/** @type {Policy[]} */
export const POLICIES = JSON.parse(readFileSync(join(here, "policies.json"), "utf8"));

const STOP = new Set(
  "a an the and or of to for in on at by from with as is are was were be been being it this that these those i you we they my your our their do does did can could should would will just about into over after before not no nor so if than then too very what which who how when where why me us employees employee company must may".split(
    " ",
  ),
);

const QUERY_EXPANSIONS = [
  [/\bwfh\b|work from home/g, " remote work "],
  [/\bpto\b|\bvacation days?\b|\bholiday\b/g, " vacation "],
  [/\bmfa\b|two-factor|2fa/g, " password security "],
  [/\bchatgpt\b|\bopenai\b|\bllm\b/g, " social media confidential "],
  [/\bgdpr\b|\bprivacy\b/g, " data privacy "],
  [/\bwifi\b|wi-fi/g, " remote access vpn "],
];

/** @param {string} text */
export function normalize(text) {
  let s = text.toLowerCase().replace(/’/g, "'");
  for (const [re, rep] of QUERY_EXPANSIONS) s = s.replace(re, rep);
  return s;
}

/** @param {string} w */
function stem(w) {
  if (w.length > 5 && w.endsWith("ly")) w = w.slice(0, -2);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** @param {string} text */
export function tokens(text) {
  return normalize(text)
    .replace(/[^a-z0-9$]+/g, " ")
    .split(/\s+/)
    .map(stem)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** @param {string} text */
export function extractNumbers(text) {
  const out = [];
  const masked = text.replace(/\b\d{1,2}:\d{2}\b/g, (m) => {
    out.push(m);
    return " ";
  });
  for (const m of masked.matchAll(/\$?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\$?\d+/g)) {
    let n = m[0].replace(/[$,]/g, "").replace(/^0+(?=\d)/, "");
    if (n) out.push(n);
  }
  return out;
}

function termFreq(toks) {
  const counts = new Map();
  for (const t of toks) counts.set(t, (counts.get(t) || 0) + 1);
  const tf = new Map();
  for (const [t, c] of counts) tf.set(t, 1 + Math.log(c));
  return tf;
}

function weight(tf, idf) {
  const v = new Map();
  let norm = 0;
  for (const [t, f] of tf) {
    const w = f * (idf.get(t) || 0);
    if (!w) continue;
    v.set(t, w);
    norm += w * w;
  }
  return { v, norm: Math.sqrt(norm) || 1 };
}

function cosine(a, b) {
  let dot = 0;
  const [small, large] = a.v.size < b.v.size ? [a, b] : [b, a];
  for (const [t, w] of small.v) {
    const other = large.v.get(t);
    if (other) dot += w * other;
  }
  return dot / (a.norm * b.norm);
}

const docs = POLICIES.map((p) => {
  const body = tokens(`${p.text} ${p.category}`);
  const title = tokens(p.title.replace(/ policy$/i, ""));
  const boosted = [...title, ...title, ...title, ...body];
  return { policy: p, title, tf: termFreq(boosted) };
});

const df = new Map();
for (const d of docs) {
  for (const term of d.tf.keys()) df.set(term, (df.get(term) || 0) + 1);
}
const idf = new Map();
for (const [term, c] of df) idf.set(term, Math.log((docs.length + 1) / (c + 0.5)) + 1);
const vectors = docs.map((d) => weight(d.tf, idf));

/**
 * Rules-based search: a phrase rule per policy title. The answer is the
 * policy sentence itself, so a hit cannot invent figures. No match abstains.
 * @param {string} question
 * @returns {LocalAnswer}
 */
export function runRules(question) {
  const qTokens = new Set(tokens(question));
  const qNorm = normalize(question);
  /** @type {{ policy: Policy, score: number }[]} */
  const scored = [];
  for (const d of docs) {
    const titleHits = d.title.filter((t) => qTokens.has(t));
    if (titleHits.length === 0) continue;
    const distinctive = titleHits.some((t) => t.length >= 5) || titleHits.length >= 2;
    if (!distinctive) continue;
    const phraseBonus = d.title.every((t) => qNorm.includes(t)) ? 4 : 0;
    scored.push({ policy: d.policy, score: titleHits.length * 3 + phraseBonus });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[0].score === scored[1].score)) {
    return {
      answer: "No rule matched this question, so this approach does not answer.",
      policyId: null,
      policyTitle: null,
      abstained: true,
      hits: scored.slice(0, 3).map((s) => ({
        id: s.policy.id,
        title: s.policy.title,
        score: s.score,
        text: s.policy.text,
        category: s.policy.category,
      })),
    };
  }
  const best = scored[0].policy;
  return {
    answer: `${best.title} (${best.id}): ${best.text}`,
    policyId: best.id,
    policyTitle: best.title,
    abstained: false,
    hits: scored.slice(0, 3).map((s) => ({
      id: s.policy.id,
      title: s.policy.title,
      score: s.score,
      text: s.policy.text,
      category: s.policy.category,
    })),
  };
}

/**
 * Sparse vector index (TF–IDF cosine). Returns the top policies above a floor.
 * @param {string} question
 * @param {number} [k]
 * @returns {Hit[]}
 */
export function retrieve(question, k = 3) {
  const q = weight(termFreq(tokens(question)), idf);
  const ranked = docs
    .map((d, i) => ({
      id: d.policy.id,
      title: d.policy.title,
      text: d.policy.text,
      category: d.policy.category,
      score: Number(cosine(q, vectors[i]).toFixed(4)),
    }))
    .sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, k);
  if (!top.length || top[0].score < 0.18) return [];
  return top;
}

/**
 * @param {{ answer: string, policyId: string | null, abstained: boolean }} result
 * @returns {Audit}
 */
export function audit(result) {
  const refusal = /does not contain|does not answer|no rule matched|cannot answer|not in the policy/i.test(
    result.answer,
  );
  if (result.abstained || refusal) {
    return {
      unsupported: 0,
      band: "Low",
      notes: ["Abstained or refused. No claim was added beyond the database."],
    };
  }
  const notes = [];
  let score = 0;
  const policy = POLICIES.find((p) => p.id === result.policyId);
  let support = "";
  if (result.policyId && !policy) {
    score += 40;
    notes.push(`Cited ${result.policyId}, which is not in the policy database.`);
    support = POLICIES.map((p) => p.text).join(" ");
  } else if (!policy) {
    score += 25;
    notes.push("No policy was identified.");
    support = POLICIES.map((p) => `${p.title} ${p.text}`).join(" ");
  } else {
    support = `${policy.title} ${policy.text}`;
    notes.push(`Checked against ${policy.id}.`);
  }
  const named = result.answer.match(/[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){1,5} Policy/g) || [];
  for (const title of named) {
    const exists = POLICIES.some((p) => p.title.toLowerCase() === title.toLowerCase());
    if (!exists) {
      score += 20;
      notes.push(`Named a policy that is not in the database: ${title}.`);
    }
  }
  const missing = extractNumbers(result.answer).filter((n) => !extractNumbers(support).includes(n));
  if (missing.length) {
    score += Math.min(60, missing.length * 20);
    notes.push(`Figures not in the supporting policy: ${missing.join(", ")}.`);
  }
  const answerWords = new Set(tokens(result.answer));
  const supportWords = new Set(tokens(support));
  let hit = 0;
  for (const w of answerWords) if (supportWords.has(w)) hit += 1;
  const coverage = answerWords.size ? hit / answerWords.size : 1;
  if (coverage < 0.28) {
    score += 30;
    notes.push(`Low wording overlap with the policy (${Math.round(coverage * 100)}%).`);
  } else if (coverage < 0.45) {
    score += 12;
    notes.push(`Partial wording overlap (${Math.round(coverage * 100)}%).`);
  } else {
    notes.push(`Wording overlap ${Math.round(coverage * 100)}%.`);
  }
  score = Math.max(0, Math.min(100, score));
  return {
    unsupported: score,
    band: score <= 15 ? "Low" : score <= 45 ? "Medium" : "High",
    notes,
  };
}

/** @param {string} question */
export function bareMessages(question) {
  return [
    {
      role: "system",
      content:
        "You are the policy assistant for this company. Employees ask about company rules. " +
        "Answer specifically, with the figures an employee would need, and name the policy. " +
        "You have not been given the policy database. If you are unsure of a company-specific figure, still give the most likely rule rather than a legal essay. " +
        'Return JSON only: {"answer": string, "policyId": string | null, "abstained": boolean}. ' +
        "policyId must be an id you actually know, otherwise null.",
    },
    { role: "user", content: question },
  ];
}

/** @param {string} question @param {Hit[]} hits */
export function indexedMessages(question, hits) {
  const excerpts = hits.length
    ? hits.map((h) => `[${h.id}] ${h.title} (score ${h.score})\n${h.text}`).join("\n\n")
    : "(no policy excerpt scored above the retrieval floor)";
  return [
    {
      role: "system",
      content:
        "You answer employee questions using ONLY the policy excerpts below. " +
        "If they do not contain the answer, set abstained true and answer exactly: The policy database does not contain this. " +
        "Do not add numbers, deadlines, or exceptions that are not written in the excerpts. " +
        "Cite the single best policy id from the excerpts, or null if abstaining. " +
        'Return JSON only: {"answer": string, "policyId": string | null, "abstained": boolean}.\n\nEXCERPTS:\n' +
        excerpts,
    },
    { role: "user", content: question },
  ];
}

export const BENCHMARK = [
  {
    id: "vacation",
    question: "How many vacation days do employees get, and can unused days roll over?",
    gold: "HR-VACATION",
  },
  {
    id: "remote",
    question: "How many days a week can I work remotely?",
    gold: "REM-REMOTE-WORK",
  },
  {
    id: "expense",
    question: "Do expenses over $500 need approval, and from whom?",
    gold: "FIN-EXPENSE-APPROVAL",
  },
  {
    id: "pension",
    question: "What percentage of salary does the company contribute to my pension?",
    gold: null,
  },
];
