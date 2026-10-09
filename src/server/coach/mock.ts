// A scripted model for tests and e2e (COACH_MOCK=1, never in production): the first step calls get_day (log_water
// when asked to log), the next answers in text. Deterministic, so the e2e can assert on the tool card and the reply.
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

export const MOCK_REPLY = "Your recovery is shown above. **Take it easy** if it is low, and aim for your usual bedtime.";

export function mockModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: "ok" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
    doStream: async ({ prompt }) => {
      const text = [
        { type: "text-start" as const, id: "t1" },
        ...MOCK_REPLY.split(/(?<= )/).map((delta) => ({ type: "text-delta" as const, id: "t1", delta })),
        { type: "text-end" as const, id: "t1" },
        { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
      ];
      const current = prompt.slice(prompt.findLastIndex((m) => m.role === "user"));
      const question = JSON.stringify(current[0]?.content ?? "").toLowerCase();
      const used = new Set(current.flatMap((m) => m.role === "tool" ? m.content.flatMap((p) => p.type === "tool-result" ? [p.toolName] : []) : []));
      const plan = /\blog\b/.test(question) ? ["log_water"] : question.includes("brief") ? ["get_day", "get_sleep", "get_health", "get_activities"] : question.includes("trend") || question.includes("hrv") ? ["get_trend"] : question.includes("habit") ? ["get_journal_impacts"] : question.includes("sleep") ? ["get_sleep"] : ["get_day"];
      const next = plan.find((name) => !used.has(name));
      const input = next === "get_trend" ? JSON.stringify({ metric: question.includes("hrv") ? "hrv" : "recovery" }) : next === "get_activities" ? JSON.stringify({ days: 14 }) : next === "get_journal_impacts" ? JSON.stringify({ outcome: "recovery" }) : next === "log_water" ? JSON.stringify({ ml: 500 }) : "{}";
      const call = [
        { type: "tool-call" as const, toolCallId: `call-${prompt.length}`, toolName: next ?? "get_day", input },
        { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage },
      ];
      const chunks: ((typeof text)[number] | (typeof call)[number])[] = next ? call : text;
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 20 }) };
    },
  });
}
