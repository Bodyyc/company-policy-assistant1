import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "./__root";
import { comparePolicies } from "@/lib/policy/compare.functions";
import type { ApproachResult, Comparison } from "@/lib/policy/types";

export const Route = createFileRoute("/")({ component: Home });

const EXAMPLES = [
  "How many vacation days do employees get, and can unused days roll over?",
  "How many days a week can I work remotely?",
  "Do expenses over $500 need approval, and from whom?",
  "How often must passwords be changed?",
  "What percentage of salary does the company contribute to my pension?",
];

function Home() {
  const [question, setQuestion] = useState(EXAMPLES[0]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Comparison | null>(null);

  async function run(next = question) {
    setPending(true);
    setError("");
    try {
      const data = await comparePolicies({ data: { question: next } });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The comparison failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <p className="text-sm font-medium tracking-wide text-muted uppercase">Company policy assistant</p>
      <h1 className="mt-2 max-w-3xl font-display text-4xl font-semibold tracking-tight text-ink">
        Three ways to answer the same policy question
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Rules-based search, a language model with no policy index, and a language model that may use only what a vector index retrieves. Each card shows the answer, the policy it names, time, tokens, and an unsupported-claim score.
      </p>

      <form
        className="mt-8 rounded-3xl border border-line bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label htmlFor="question" className="text-sm font-medium text-ink">
          Employee question
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className="mt-2 w-full resize-y rounded-lg border border-line bg-paper px-3 py-3 text-base text-ink outline-none focus:border-accent"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuestion(ex);
                void run(ex);
              }}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-left text-sm text-muted hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-fg disabled:opacity-60"
          >
            {pending ? "Comparing…" : "Compare approaches"}
          </button>
          {pending && (
            <p className="text-sm text-muted">Rules run locally. The two model calls run together.</p>
          )}
        </div>
      </form>

      {error && <p className="mt-4 text-sm text-warn">{error}</p>}

      {result && (
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {result.approaches.map((item) => (
            <ResultCard key={item.method} item={item} />
          ))}
        </div>
      )}

      <section className="mt-10 max-w-3xl text-sm text-muted">
        <h2 className="font-display text-2xl font-semibold text-ink">How the score is computed</h2>
        <p className="mt-2">
          Unsupported tendency is 0 to 100. Abstaining scores 0. Otherwise the auditor checks that any cited policy exists, that every figure in the answer appears in that policy, and that the wording overlaps the policy text. It does not use a second model. Token counts are the API total, including any reasoning tokens. Rules use no tokens.
        </p>
      </section>
    </Shell>
  );
}

function ResultCard({ item }: { item: ApproachResult }) {
  const bandClass =
    item.band === "High" ? "text-warn" : item.band === "Medium" ? "text-mid" : "text-accent";
  return (
    <article className="flex flex-col rounded-3xl border border-line bg-card p-4">
      <h2 className="font-display text-xl font-semibold text-ink">{item.label}</h2>
      <p className="mt-1 text-sm text-muted">{blurb(item.method)}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
        <Stat label="Time" value={`${item.ms} ms`} />
        <Stat label="Tokens" value={String(item.tokens)} />
        <Stat label="Unsupported" value={`${item.unsupported}`} tone={bandClass} />
      </dl>
      <p className={`mt-2 text-xs font-medium ${bandClass}`}>{item.band} tendency to answer beyond the database</p>
      <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">Relevant policy</p>
      <p className="mt-1 text-sm text-ink">
        {item.policyId ? `${item.policyId} — ${item.policyTitle ?? "Not in the database"}` : "None identified"}
      </p>
      <p className="mt-4 text-xs font-medium tracking-wide text-muted uppercase">Answer</p>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-ink">{item.answer}</p>
      {item.hits.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Retrieved: {item.hits.map((h) => `${h.id} (${h.score})`).join(", ")}
        </p>
      )}
      <ul className="mt-3 space-y-1 text-xs text-muted">
        {item.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </article>
  );
}

function Stat({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-paper px-2 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className={`mt-1 text-sm ${tone}`}>{value}</dd>
    </div>
  );
}

function blurb(method: ApproachResult["method"]) {
  if (method === "rules") return "Phrase rules on policy titles. The answer is the policy sentence. No model.";
  if (method === "llm") return "The model is told it is the company assistant. It receives none of the policy text.";
  return "A TF–IDF vector index retrieves the closest policies. The model may use only those excerpts.";
}
