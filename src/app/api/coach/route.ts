// The coach's chat endpoint (useChat on /coach). Order: signed in, coach access, a usable model (consent and key),
// requests per minute, then the chat itself, loaded and saved by id **and** the user. Never logs message content,
// tool output, keys or provider bodies. Log tools wait for the user: a turn ends at their confirmation card, and the
// answer comes back as a request with `approvals` (ids and yes/no only), checked against the saved chat.
import { createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, validateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { requestUser } from "@/server/auth";
import { answerApprovals, settlePending } from "@/server/coach/approvals";
import { coachHistory } from "@/server/coach/history";
import { coachInstructions } from "@/server/coach/instructions";
import { allowRequest, claimChat, coachModel, loadChat, saveChat } from "@/server/coach/store";
import { coachTexts } from "@/server/coach/texts";
import { coachApproval } from "@/server/coach/logTools";
import { coachTools } from "@/server/coach/tools";
import { getDb } from "@/server/db";
import { ctxOf } from "@/server/queries/common";

/**
 * One request per turn: the chat id and the newest user message (the server holds the history). `trigger` and
 * `messageId` are useChat's: `submit-message` with a `messageId` is an edit of that (saved) user message, which drops it
 * and everything after; `regenerate-message` answers `message` again, dropping what followed it.
 */
const Body = z
  .object({
    id: z.string().regex(/^[\w-]{8,64}$/),
    message: z.object({ id: z.string().min(1).max(100), role: z.literal("user"), parts: z.array(z.unknown()).min(1).max(20) }).passthrough(),
    trigger: z.enum(["submit-message", "regenerate-message"]).default("submit-message"),
    messageId: z.string().min(1).max(100).optional(),
  })
  .strict();

/** The user's answers to the confirmation cards on the chat's last message. */
const Approvals = z
  .object({
    id: z.string().regex(/^[\w-]{8,64}$/),
    approvals: z.array(z.object({ id: z.string().min(1).max(200), approved: z.boolean() }).strict()).min(1).max(30),
  })
  .strict();

/**
 * The saved history this turn builds on, or null when the request names a message the chat doesn't have.
 * - A new message: everything saved.
 * - An edit: everything before the edited user message (it must be one, and the replacement carries its id).
 * - A regenerate: everything before `message` if it was saved (a retry after a failed first send was not); the
 *   `messageId` (the answer being replaced, when given) must belong to the chat.
 */
function historyFor(saved: UIMessage[], b: Pick<z.infer<typeof Body>, "message" | "trigger" | "messageId">): UIMessage[] | null {
  const at = (id: string) => saved.findIndex((m) => m.id === id);
  if (b.trigger === "submit-message") {
    if (b.messageId === undefined) return saved;
    const i = at(b.messageId);
    return b.messageId === b.message.id && i >= 0 && saved[i].role === "user" ? saved.slice(0, i) : null;
  }
  if (b.messageId !== undefined && at(b.messageId) < 0) return null;
  const i = at(b.message.id);
  return i >= 0 ? saved.slice(0, i) : saved;
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return fail(401, "signed_out");
  const db = getDb();
  const m = await coachModel(db, user.userId);
  if ("problem" in m) return m.problem === "no_access" ? fail(404, "not_found") : fail(409, "key");
  if (!allowRequest(user.userId)) return fail(429, "limit");

  const body = z.union([Body, Approvals]).safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "bad_request");
  const b = body.data;
  const ctx = await ctxOf(db, user.userId).catch(() => null);
  if (!ctx) return fail(409, "profile");

  const texts = await coachTexts(db); // the admin dashboard's wording, read per request
  const tools = coachTools(ctx, texts);
  const saved = (await loadChat(db, user.userId, b.id)) ?? [];
  let next: UIMessage[] | null;
  if ("approvals" in b) next = answerApprovals(saved, b.approvals);
  else {
    const previous = historyFor(settlePending(saved), b);
    next = previous && [...previous, { id: b.message.id, role: "user", parts: b.message.parts as UIMessage["parts"] }];
  }
  if (!next) return fail(400, "bad_request");
  const messages = await validateUIMessages({ messages: next, tools }).catch(() => null);
  if (!messages) return fail(400, "bad_request");
  // Answers are applied once: a double tap, a retry or a second tab sending the same answer finds them taken.
  if ("approvals" in b && !(await claimChat(db, user.userId, b.id, saved, messages))) return fail(409, "answered");

  const started = Date.now();
  const history = await coachHistory(messages, m.model, texts, req.signal);
  const result = streamText({
    model: m.model,
    instructions: coachInstructions(ctx, texts, m.instructions),
    messages: history.modelMessages,
    tools,
    toolApproval: coachApproval,
    stopWhen: isStepCount(6),
    abortSignal: req.signal,
  });
  result.consumeStream(); // finish and save even if the browser goes away

  return createUIMessageStreamResponse({
    headers: { "X-Accel-Buffering": "no" }, // stream through nginx-style proxies
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: history.saved,
      generateMessageId: () => crypto.randomUUID(),
      onEnd: async ({ messages: all }) => {
        await saveChat(db, user.userId, b.id, all);
        console.info(`[coach] user ${user.userId} via ${m.provider}: ${Date.now() - started} ms`);
      },
      onError: (e) => {
        // Status and name only: provider errors can echo the request.
        console.warn(`[coach] ${m.provider} failed: ${e instanceof Error ? e.name : "error"}`);
        return "provider";
      },
    }),
  });
}
