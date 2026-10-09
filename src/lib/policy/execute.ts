import {
  BENCHMARK,
  audit,
  bareMessages,
  indexedMessages,
  POLICIES,
  retrieve,
  runRules,
} from "../../../shared/engine.mjs";
import type { ApproachResult, Comparison } from "./types";

type ModelJson = {
  answer?: string;
  policyId?: string | null;
  abstained?: boolean;
};

type ModelCall = {
  ok: boolean;
  error?: string;
  answer: string;
  policyId: string | null;
  abstained: boolean;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  ms: number;
};

const cache = new Map<string, Comparison>();
let calls = 0;
const CALL_CAP = 40;

function knownId(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  const clean = id.trim().toUpperCase();
  return POLICIES.some((p) => p.id === clean) ? clean : id.trim();
}

function parseModel(content: string): ModelJson {
  const fenced = content.match(/\{[\s\S]*\}/);
  const raw = fenced ? fenced[0] : content;
  try {
    return JSON.parse(raw) as ModelJson;
  } catch {
    return { answer: content, policyId: null, abstained: false };
  }
}

async function ask(messages: { role: string; content: string }[]): Promise<ModelCall> {
  const started = Date.now();
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "The model is not available in this environment.",
      answer: "",
      policyId: null,
      abstained: true,
      tokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      ms: Date.now() - started,
    };
  }
  if (calls >= CALL_CAP) {
    return {
      ok: false,
      error: "Comparison limit reached for this session. Try a question already asked, or reload later.",
      answer: "",
      policyId: null,
      abstained: true,
      tokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      ms: Date.now() - started,
    };
  }
  calls += 1;
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: AbortSignal.timeout(50000),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Model request failed (${res.status}).`,
        answer: "",
        policyId: null,
        abstained: true,
        tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        ms: Date.now() - started,
      };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = parseModel(content);
    const policyId = knownId(parsed.policyId);
    const policy = POLICIES.find((p) => p.id === policyId);
    return {
      ok: true,
      answer: (parsed.answer || content || "No answer returned.").trim(),
      policyId: policy ? policy.id : policyId,
      abstained: Boolean(parsed.abstained),
      tokens: body.usage?.total_tokens ?? 0,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
      ms: Date.now() - started,
    };
  } catch {
    return {
      ok: false,
      error: "The model request timed out or could not be reached.",
      answer: "",
      policyId: null,
      abstained: true,
      tokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      ms: Date.now() - started,
    };
  }
}

function packModel(
  method: ApproachResult["method"],
  label: string,
  call: ModelCall,
  hits: ApproachResult["hits"],
): ApproachResult {
  const policy = POLICIES.find((p) => p.id === call.policyId);
  const answer = call.ok
    ? call.answer
    : call.error || "The model approach did not return an answer.";
  const checked = audit({
    answer,
    policyId: policy?.id ?? null,
    abstained: call.abstained || !call.ok,
  });
  return {
    method,
    label,
    answer,
    policyId: policy?.id ?? (call.ok ? call.policyId : null),
    policyTitle: policy?.title ?? null,
    abstained: call.abstained || !call.ok,
    ms: call.ms,
    tokens: call.tokens,
    promptTokens: call.promptTokens,
    completionTokens: call.completionTokens,
    unsupported: checked.unsupported,
    band: checked.band,
    notes: call.ok ? checked.notes : [call.error || "Model unavailable.", ...checked.notes],
    hits,
    error: call.ok ? undefined : call.error,
  };
}

export async function executeComparison(question: string): Promise<Comparison> {
  const key = question.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  const started = Date.now();
  const rules = runRules(question);
  const rulesAudit = audit(rules);
  const rulesResult: ApproachResult = {
    method: "rules",
    label: "Rules-based search",
    answer: rules.answer,
    policyId: rules.policyId,
    policyTitle: rules.policyTitle,
    abstained: rules.abstained,
    ms: Date.now() - started,
    tokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    unsupported: rulesAudit.unsupported,
    band: rulesAudit.band,
    notes: rulesAudit.notes,
    hits: rules.hits,
  };

  const retrieved = retrieve(question, 3);
  const [bare, indexed] = await Promise.all([
    ask(bareMessages(question)),
    ask(indexedMessages(question, retrieved)),
  ]);

  const comparison: Comparison = {
    question,
    cached: false,
    approaches: [
      rulesResult,
      packModel("llm", "LLM without a vector index", bare, []),
      packModel("llm-index", "LLM with a vector index", indexed, retrieved),
    ],
  };
  cache.set(key, comparison);
  return comparison;
}

export async function executeBenchmark() {
  const rows = [];
  for (const item of BENCHMARK) {
    const comparison = await executeComparison(item.question);
    rows.push({
      id: item.id,
      question: item.question,
      gold: item.gold,
      approaches: comparison.approaches.map((a) => ({
        method: a.method,
        label: a.label,
        policyId: a.policyId,
        correct: item.gold === null ? a.abstained || a.policyId === null : a.policyId === item.gold,
        ms: a.ms,
        tokens: a.tokens,
        unsupported: a.unsupported,
        band: a.band,
        abstained: a.abstained,
        answer: a.answer,
      })),
    });
  }
  return { rows };
}
