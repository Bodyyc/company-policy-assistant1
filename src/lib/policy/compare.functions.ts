import { createServerFn } from "@tanstack/react-start";
import type { Comparison } from "./types";

export const comparePolicies = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Missing question.");
    const question = (input as { question?: unknown }).question;
    if (typeof question !== "string") throw new Error("Missing question.");
    const q = question.trim().replace(/\s+/g, " ");
    if (q.length < 8 || q.length > 400) {
      throw new Error("Use a question between 8 and 400 characters.");
    }
    return { question: q };
  })
  .handler(async ({ data }): Promise<Comparison> => {
    const { executeComparison } = await import("./execute");
    return executeComparison(data.question);
  });

export const runBenchmark = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async () => {
    const { executeBenchmark } = await import("./execute");
    return executeBenchmark();
  });
