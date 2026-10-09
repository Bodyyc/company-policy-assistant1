import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "./__root";
import { runBenchmark } from "@/lib/policy/compare.functions";

export const Route = createFileRoute("/write-up")({ component: WriteUp });

type BenchRow = {
  question: string;
  gold: string | null;
  approaches: {
    label: string;
    policyId: string | null;
    correct: boolean;
    ms: number;
    tokens: number;
    unsupported: number;
    band: string;
    abstained: boolean;
  }[];
};

const RECORDED: BenchRow[] = [
  {
    question: "How many vacation days do employees get, and can unused days roll over?",
    gold: "HR-VACATION",
    approaches: [
      { label: "Rules-based search", policyId: "HR-VACATION", correct: true, ms: 1, tokens: 0, unsupported: 0, band: "Low", abstained: false },
      { label: "LLM without a vector index", policyId: null, correct: false, ms: 9612, tokens: 1199, unsupported: 25, band: "Medium", abstained: false },
      { label: "LLM with a vector index", policyId: "HR-VACATION", correct: true, ms: 2667, tokens: 883, unsupported: 0, band: "Low", abstained: false },
    ],
  },
  {
    question: "How many days a week can I work remotely?",
    gold: "REM-REMOTE-WORK",
    approaches: [
      { label: "Rules-based search", policyId: "REM-REMOTE-WORK", correct: true, ms: 1, tokens: 0, unsupported: 0, band: "Low", abstained: false },
      { label: "LLM without a vector index", policyId: null, correct: false, ms: 4401, tokens: 1004, unsupported: 0, band: "Low", abstained: true },
      { label: "LLM with a vector index", policyId: "REM-REMOTE-WORK", correct: true, ms: 2472, tokens: 916, unsupported: 0, band: "Low", abstained: false },
    ],
  },
  {
    question: "Do expenses over $500 need approval, and from whom?",
    gold: "FIN-EXPENSE-APPROVAL",
    approaches: [
      { label: "Rules-based search", policyId: "FIN-EXPENSE-APPROVAL", correct: true, ms: 1, tokens: 0, unsupported: 0, band: "Low", abstained: false },
      { label: "LLM without a vector index", policyId: null, correct: false, ms: 4828, tokens: 919, unsupported: 45, band: "Medium", abstained: false },
      { label: "LLM with a vector index", policyId: "FIN-EXPENSE-APPROVAL", correct: true, ms: 3462, tokens: 943, unsupported: 0, band: "Low", abstained: false },
    ],
  },
  {
    question: "What percentage of salary does the company contribute to my pension?",
    gold: null,
    approaches: [
      { label: "Rules-based search", policyId: null, correct: true, ms: 1, tokens: 0, unsupported: 0, band: "Low", abstained: true },
      { label: "LLM without a vector index", policyId: null, correct: false, ms: 6958, tokens: 1154, unsupported: 57, band: "High", abstained: false },
      { label: "LLM with a vector index", policyId: null, correct: true, ms: 2519, tokens: 827, unsupported: 0, band: "Low", abstained: true },
    ],
  },
];

function WriteUp() {
  const [rows, setRows] = useState<BenchRow[] | null>(RECORDED);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setPending(true);
    setError("");
    try {
      const data = await runBenchmark();
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benchmark failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <p className="text-sm font-medium tracking-wide text-muted uppercase">Submission write-up</p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Comparison and preferred approach</h1>
      <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-ink">
        <p>
          The three approaches were run on the same 98-policy database and the same employee questions. Rules-based search matches distinctive words from a policy title and returns that policy sentence unchanged, so it uses no tokens and almost never states a figure the database does not contain; it abstains when no title matches or two rules tie, which keeps its unsupported-answer score at the floor but misses paraphrases that do not reuse the title. The language model with no vector index is instructed to answer as the company assistant and is given none of the policy text. It answers quickly relative to a long-context prompt, but it regularly names policies that are not in the database and adds figures, such as a pension percentage, that no record contains. The third approach embeds each question and policy in a TF–IDF vector index, retrieves the closest excerpts, and allows the model to answer only from those excerpts, with an instruction to abstain if they do not contain the answer. That raises token use by the size of the excerpts and adds a retrieval step, and it is the only model setting that both names the relevant policy id and refuses questions the database does not cover.
        </p>
        <p>
          On a recorded run of four questions, rules and the indexed model both named HR-VACATION, REM-REMOTE-WORK, and FIN-EXPENSE-APPROVAL, and both abstained on pension. The model with no index abstained once, then invented a five-day vacation cap and a manager sign-off the records do not contain, and on the pension question stated a 5 percent contribution under a Retirement Benefits Policy that is not in the database. That is the unsupported-answer tendency: about 900 to 1,200 tokens a call, several seconds, and claims the auditor flags because the figures are absent from every policy. The indexed calls used a similar token budget because these policies are one sentence each, and they quoted the retrieved record or refused.
        </p>
      </div>

      <h2 className="mt-10 font-display text-2xl font-semibold">Table 1. What each approach is allowed to see</h2>
      <div className="mt-3 overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Approach</th>
              <th className="px-4 py-3 font-medium">Input</th>
              <th className="px-4 py-3 font-medium">Tokens</th>
              <th className="px-4 py-3 font-medium">Unsupported answers</th>
              <th className="px-4 py-3 font-medium">Typical failure</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="px-4 py-3">Rules-based search</td>
              <td className="px-4 py-3">Title phrase rules only</td>
              <td className="px-4 py-3 tabular-nums">0</td>
              <td className="px-4 py-3">Low, because it quotes or abstains</td>
              <td className="px-4 py-3">Misses a paraphrase, or ties and abstains</td>
            </tr>
            <tr className="border-b border-line">
              <td className="px-4 py-3">LLM, no vector index</td>
              <td className="px-4 py-3">Question only</td>
              <td className="px-4 py-3">Prompt plus completion, no policy text</td>
              <td className="px-4 py-3">High when it invents a rule</td>
              <td className="px-4 py-3">States figures and policy ids the database does not have</td>
            </tr>
            <tr>
              <td className="px-4 py-3">LLM with vector index</td>
              <td className="px-4 py-3">Top TF–IDF excerpts only</td>
              <td className="px-4 py-3">Higher, because excerpts are in the prompt</td>
              <td className="px-4 py-3">Low when it follows the excerpts</td>
              <td className="px-4 py-3">Weak retrieval can still leave it with the wrong excerpt</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-display text-2xl font-semibold">Table 2. Four-question check</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Gold policies: HR-VACATION, REM-REMOTE-WORK, FIN-EXPENSE-APPROVAL, and no policy for the pension question. Run it here to fill the measured times, tokens, and unsupported scores. A correct pension answer abstains.
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className="mt-4 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-fg disabled:opacity-60"
      >
        {pending ? "Running four questions…" : "Run benchmark"}
      </button>
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      {rows && (
        <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Question</th>
                <th className="px-4 py-3 font-medium">Approach</th>
                <th className="px-4 py-3 font-medium">Policy</th>
                <th className="px-4 py-3 font-medium">Correct</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Unsupported</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((row) =>
                row.approaches.map((a) => (
                  <tr key={`${row.question}-${a.label}`} className="border-b border-line">
                    <td className="px-4 py-3">{row.question}</td>
                    <td className="px-4 py-3">{a.label}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.policyId ?? "none"}</td>
                    <td className="px-4 py-3">{a.correct ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 tabular-nums">{a.ms} ms</td>
                    <td className="px-4 py-3 tabular-nums">{a.tokens}</td>
                    <td className="px-4 py-3 tabular-nums">{a.unsupported} ({a.band})</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
