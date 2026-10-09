import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "./__root";
import policies from "../../shared/policies.json";

export const Route = createFileRoute("/policies")({ component: PoliciesPage });

function PoliciesPage() {
  const groups = new Map<string, typeof policies>();
  for (const policy of policies) {
    const list = groups.get(policy.category) ?? [];
    list.push(policy);
    groups.set(policy.category, list);
  }
  return (
    <Shell>
      <p className="text-sm font-medium tracking-wide text-muted uppercase">Policy database</p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">98 company policies</h1>
      <p className="mt-3 max-w-2xl text-muted">
        This is the only source the rules and the vector index may use. Each record is one sentence. A correct assistant quotes it and names its id. Anything more specific is unsupported.
      </p>
      <div className="mt-8 space-y-8">
        {[...groups.entries()].map(([category, items]) => (
          <section key={category}>
            <h2 className="font-display text-2xl font-semibold">{category}</h2>
            <ul className="mt-3 divide-y divide-line rounded-3xl border border-line bg-card">
              {items.map((policy) => (
                <li key={policy.id} className="px-4 py-3">
                  <p className="font-mono text-xs text-muted">{policy.id}</p>
                  <p className="mt-1 font-medium text-ink">{policy.title}</p>
                  <p className="mt-1 text-sm text-muted">{policy.text}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}
