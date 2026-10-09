import type { UIMessage } from "ai";
import { expect, it } from "vitest";
import { answerApprovals, MOVED_ON, settlePending } from "./approvals";

const ask = (id: string, extra: object = {}) => ({ type: "tool-log_water", toolCallId: `c-${id}`, state: "approval-requested", input: { ml: 500 }, approval: { id, ...extra } });
const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Log 500 ml" }] };
const coach = (...parts: object[]): UIMessage => ({ id: "a1", role: "assistant", parts: parts as UIMessage["parts"] });

it("applies answers that cover exactly the last message's open, manual confirmations", () => {
  const chat = [user, coach(ask("x"), ask("y"))];
  const out = answerApprovals(chat, [{ id: "x", approved: true }, { id: "y", approved: false }])!;
  expect(out.at(-1)!.parts).toMatchObject([
    { state: "approval-responded", input: { ml: 500 }, approval: { id: "x", approved: true } },
    { state: "approval-responded", approval: { id: "y", approved: false } },
  ]);
  expect(chat[1].parts[0]).toMatchObject({ state: "approval-requested" });
});

it("refuses unknown, missing, repeated or automatic ids, and a chat whose last message isn't the coach's", () => {
  expect(answerApprovals([user, coach(ask("x"), ask("y"))], [{ id: "x", approved: true }])).toBeNull();
  expect(answerApprovals([user, coach(ask("x"))], [{ id: "z", approved: true }])).toBeNull();
  expect(answerApprovals([user, coach(ask("x"))], [{ id: "x", approved: true }, { id: "x", approved: false }])).toBeNull();
  expect(answerApprovals([user, coach(ask("x", { isAutomatic: true }))], [{ id: "x", approved: true }])).toBeNull();
  expect(answerApprovals([coach(ask("x")), user], [{ id: "x", approved: true }])).toBeNull();
  expect(answerApprovals([], [{ id: "x", approved: true }])).toBeNull();
});

it("a new message turns every open confirmation into a denial and leaves the rest alone", () => {
  const done = { type: "tool-get_day", toolCallId: "d", state: "output-available", input: {}, output: {} };
  const out = settlePending([user, coach(done, ask("x"))]);
  expect(out[0]).toBe(user);
  expect(out[1].parts).toMatchObject([done, { state: "output-denied", approval: { id: "x", approved: false, reason: MOVED_ON } }]);
});
