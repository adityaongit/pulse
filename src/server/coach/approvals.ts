// The user's answers to the coach's log confirmations, applied to the chat the server saved. The browser sends only
// approval ids and yes/no: the tool and its input come from the saved chat, so a client can approve only a call the
// model actually made, exactly as it was shown.
import type { UIMessage } from "ai";

type Part = UIMessage["parts"][number];
type Pending = Part & { state: "approval-requested"; approval: { id: string; isAutomatic?: boolean } };
export type ApprovalAnswer = { id: string; approved: boolean };

const isPending = (p: Part): p is Pending => "state" in p && p.state === "approval-requested";

export const MOVED_ON = "Not confirmed: the user sent a new message instead.";

/** Confirmations left unanswered when the user wrote again: each becomes a denial, so no call is left without a result. */
export function settlePending(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) =>
    m.parts.some(isPending)
      ? { ...m, parts: m.parts.map((p) => (isPending(p) ? ({ ...p, state: "output-denied", approval: { ...p.approval, approved: false, reason: MOVED_ON } } as Part) : p)) }
      : m,
  );
}

/**
 * The saved chat with `answers` applied to its last message, or null unless that message is the coach's and the answers
 * cover exactly its open, manual confirmations.
 */
export function answerApprovals(saved: UIMessage[], answers: ApprovalAnswer[]): UIMessage[] | null {
  const last = saved.at(-1);
  if (!last || last.role !== "assistant") return null;
  const open = last.parts.filter((p): p is Pending => isPending(p) && !p.approval.isAutomatic);
  const byId = new Map(answers.map((a) => [a.id, a.approved]));
  if (open.length === 0 || byId.size !== answers.length || byId.size !== open.length || open.some((p) => !byId.has(p.approval.id))) return null;
  const parts = last.parts.map((p) => (isPending(p) && byId.has(p.approval.id) ? ({ ...p, state: "approval-responded", approval: { ...p.approval, approved: byId.get(p.approval.id)! } } as Part) : p));
  return [...saved.slice(0, -1), { ...last, parts }];
}
