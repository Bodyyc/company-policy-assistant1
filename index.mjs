import { App } from "@slack/bolt";
import {
  audit,
  indexedMessages,
  POLICIES,
  retrieve,
  runRules,
} from "../shared/engine.mjs";

const token = process.env.SLACK_BOT_TOKEN;
const appToken = process.env.SLACK_APP_TOKEN;
if (!token || !appToken) {
  console.error("Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN. See bot/README.md.");
  process.exit(1);
}

const app = new App({ token, appToken, socketMode: true });

function clean(text) {
  return text.replace(/<@[A-Z0-9]+>/g, "").replace(/^\/policy\s*/i, "").trim();
}

async function answer(question) {
  const hits = retrieve(question, 3);
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    const rules = runRules(question);
    const top = hits[0];
    const policyId = top?.id ?? rules.policyId;
    const policy = POLICIES.find((p) => p.id === policyId);
    const answerText = policy
      ? `${policy.title} (${policy.id}): ${policy.text}`
      : "The policy database does not contain this.";
    return { text: answerText, policyId: policy?.id ?? null, method: "vector index, extractive" };
  }
  const messages = indexedMessages(question, hits);
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const rules = runRules(question);
    return {
      text: rules.answer,
      policyId: rules.policyId,
      method: "rules fallback after model error",
    };
  }
  const body = await res.json();
  const raw = body.choices?.[0]?.message?.content ?? "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : raw);
  const policy = POLICIES.find((p) => p.id === parsed.policyId);
  const text = policy
    ? `${policy.title} (${policy.id}): ${parsed.answer}`
    : parsed.answer || "The policy database does not contain this.";
  const checked = audit({
    answer: text,
    policyId: policy?.id ?? null,
    abstained: Boolean(parsed.abstained) || !policy,
  });
  return { text, policyId: policy?.id ?? null, method: "LLM with vector index", unsupported: checked.unsupported };
}

function format(result, question) {
  return [
    `*Policy answer*`,
    result.text,
    result.policyId ? `Relevant policy: \`${result.policyId}\`` : "Relevant policy: none in the database",
    `_Method: ${result.method}. Question: ${question}_`,
  ].join("\n");
}

app.event("app_mention", async ({ event, say }) => {
  const question = clean(event.text || "");
  if (question.length < 8) {
    await say({ text: "Ask a policy question after the mention, for example: how many vacation days do we get?", thread_ts: event.ts });
    return;
  }
  const result = await answer(question);
  await say({ text: format(result, question), thread_ts: event.ts });
});

app.command("/policy", async ({ command, ack, respond }) => {
  await ack();
  const question = clean(command.text || "");
  if (question.length < 8) {
    await respond("Use `/policy` followed by a question, for example `/policy how many vacation days do we get?`");
    return;
  }
  const result = await answer(question);
  await respond(format(result, question));
});

await app.start();
console.log("Helvig policy bot is connected with Socket Mode.");
