import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { UIMessage } from "ai"
import { Coach } from "./Coach"

const h = vi.hoisted(() => ({ send: vi.fn(), messages: [] as unknown[], status: "ready" }))
vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ messages: h.messages, sendMessage: h.send, regenerate: vi.fn(), status: h.status, stop: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/coach", useSearchParams: () => new URLSearchParams() }))
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }))
vi.mock("./ChatList", () => ({ ChatList: () => null, NewChatButton: () => <button type="button">New chat</button> }))

afterEach(() => {
  cleanup()
  h.send.mockClear()
  h.messages = []
})

const suggestions = [
  { key: "brief" as const, text: "Today's brief" },
  { key: "sleep" as const, text: "How can I improve tonight's sleep?" },
]
const coach = (opener: boolean) => <Coach id="chat-1" initial={[]} groups={[]} next={null} prefill="" auto={false} opener={opener} suggestions={suggestions} />

it("the day's first chat opens with the coach's hidden turn, once", async () => {
  render(coach(true))
  await waitFor(() => expect(h.send).toHaveBeenCalledExactlyOnceWith({ text: "opener", metadata: { coachOpener: true } }))
})

it("hides the opener, and after an answer offers the suggestions not asked yet as chips", () => {
  h.messages = [
    { id: "o", role: "user", parts: [{ type: "text", text: "secret prompt" }], metadata: { coachOpener: true } },
    { id: "a", role: "assistant", parts: [{ type: "text", text: "Hi there." }] },
    { id: "u", role: "user", parts: [{ type: "text", text: "Today's brief" }] },
    { id: "b", role: "assistant", parts: [{ type: "text", text: "Here it is." }] },
  ] satisfies UIMessage[]
  render(coach(false))
  expect(screen.queryByText("secret prompt")).not.toBeInTheDocument()
  expect(screen.getByText("Hi there.")).toBeInTheDocument()
  const chips = screen.getByRole("list", { name: "Suggested replies" })
  expect(chips.textContent).toBe("How can I improve tonight's sleep?")
  expect(h.send).not.toHaveBeenCalled()
})
