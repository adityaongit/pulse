"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Check, Clipboard, History, Mic, NotebookPen, PanelLeftClose, PanelLeftOpen, Pencil, RotateCcw, Settings2, Square, ThumbsDown, ThumbsUp } from "lucide-react"
import { FEATURES } from "@/lib/features"
import { cn } from "@/lib/utils"
import type { dayDigest } from "@/server/coach/tools"
import type { ChatCursor, ChatGroup } from "@/server/coach/store"
import { Mark } from "@/components/brand/Mark"
import type { MiniRingVariant } from "@/components/metrics/MiniRing"
import { DATA_COLORS, dialColor } from "@/lib/bands"
import { SheetTrigger } from "@/components/shells/SheetTrigger"
import { GLASS } from "@/components/shells/AppNav"
import { panelStore } from "@/components/shells/panelStore"
import { Button } from "@/components/ui/button"
import { CARD_MATERIAL } from "@/components/ui/card"
import { ChatList, NewChatButton } from "./ChatList"
import { Prose } from "./Prose"

import type { CoachSuggestion } from "@/core/algorithms/coachSuggestions"
import { Evidence } from "./Evidence"

type DayDigest = Awaited<ReturnType<typeof dayDigest>>
type Num = { value: number | null; reason?: string | null }

const RUNNING: Record<string, string> = {
  get_day: "Looking at your day…",
  get_sleep: "Reading your sleep and bedtime plan…",
  get_activity: "Checking workout intensity…",
  get_trend: "Checking your trends…",
  get_activities: "Looking at your workouts…",
  get_journal_impacts: "Reading your journal…",
  get_health: "Checking your Health Monitor…",
  get_report: "Reading your report…",
  get_profile: "Checking your profile…",
}

const REASON: Record<string, string> = {
  calibrating: "Calibrating",
  no_hrv_last_night: "No HRV",
  awaiting_sleep_sync: "Syncing",
  insufficient_hr_data: "Not enough data",
  band_not_worn: "Not worn",
  no_data: "No data",
}

const MAX: Record<MiniRingVariant, number> = { recovery: 100, sleep: 100, strain: 21 }

function Stat({ variant, label, m, unit }: { variant: MiniRingVariant; label: string; m: Num; unit?: string }) {
  const color = m.value === null ? null : DATA_COLORS[dialColor(variant, m.value)]
  return (
    <div className="min-w-0 rounded-md bg-foreground/[0.035] p-3">
      <p className="text-[12px] leading-4 font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-numeric text-[22px] leading-7 font-bold tabular-nums", color?.text)}>
        {m.value === null ? <span className="text-[14px] leading-7 font-semibold text-foreground-secondary">{REASON[m.reason ?? "no_data"]}</span> : `${m.value}${unit ?? ""}`}
      </p>
      <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
        {m.value !== null && <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (m.value / MAX[variant]) * 100)}%`, background: color?.css }} />}
      </span>
    </div>
  )
}

function DayCard({ d }: { d: DayDigest }) {
  const movers = d.recovery.contributors.filter((c) => c.points !== null && Math.abs(c.points) >= 1).sort((a, b) => Math.abs(b.points!) - Math.abs(a.points!)).slice(0, 3)
  return (
    <div className={cn(CARD_MATERIAL, "p-2")}>
      <div className="grid grid-cols-3 gap-2">
        <Stat variant="recovery" label="Recovery" m={d.recovery} unit="%" />
        <Stat variant="sleep" label="Sleep" m={d.sleep.performance} unit="%" />
        <Stat variant="strain" label="Strain" m={d.strain} />
      </div>
      {movers.length > 0 && (
        <div className="px-2 pt-3 pb-1.5">
          <p className="text-[12px] leading-4 font-medium text-muted-foreground">What moved Recovery</p>
          <ul className="mt-1.5 divide-y divide-border text-[14px] leading-5">
            {movers.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-foreground-secondary">{c.label}</span>
                <span className={cn("font-numeric font-semibold tabular-nums", c.points! > 0 ? "text-recovery-green" : "text-recovery-red-text")}>
                  {c.points! > 0 ? "+" : "−"}
                  {Math.abs(c.points!)} {Math.abs(c.points!) === 1 ? "pt" : "pts"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Caption({ live, children }: { live?: boolean; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
      <span aria-hidden className={cn("size-1.5 rounded-full bg-coach", live && "animate-pulse motion-reduce:animate-none")} />
      {children}
    </p>
  )
}

type Part = UIMessage["parts"][number]

function PartView({ part }: { part: Part }) {
  if (part.type === "text") return <Prose text={part.text} />
  if (!part.type.startsWith("tool-")) return null
  const name = part.type.slice(5)
  const tool = part as Part & { state: string; output?: unknown }
  if (tool.state === "output-error") return <Caption>Couldn’t read that part of your data.</Caption>
  if (tool.state !== "output-available") return <Caption live>{RUNNING[name] ?? "Looking at your data…"}</Caption>
  if (name === "get_day") return <div className="space-y-2"><DayCard d={tool.output as DayDigest} /><Evidence name={name} output={tool.output} /></div>
  return <Evidence name={name} output={tool.output} />
}

/** The answer as plain words (no ** marks), for the clipboard and the screen-reader announcement. */
const plain = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text.replace(/\*\*/g, "") : ""))
    .join("\n\n")
    .trim()

const ACTION = "relative text-muted-foreground hover:text-foreground pointer-coarse:size-10"
/** Shown on hover or focus of its message with a mouse; always on touch screens, which have no hover. */
const REVEAL = "transition-[opacity,background-color,color] pointer-fine:opacity-0 pointer-fine:group-hover/msg:opacity-100 pointer-fine:group-focus-within/msg:opacity-100 pointer-fine:disabled:invisible"

// Both icons stay mounted so the copied state can animate in either direction.
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const ICON = "absolute size-4 transition-[opacity,scale,filter] duration-200 ease-standard motion-reduce:transition-none"
  return (
    <Button type="button" variant="ghost" size="icon-lg" aria-label={copied ? "Copied" : "Copy answer"} onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})} className={ACTION}>
      <Clipboard aria-hidden strokeWidth={1.75} className={cn(ICON, copied && "scale-25 opacity-0 blur-[4px]")} />
      <Check aria-hidden strokeWidth={2} className={cn(ICON, !copied && "scale-25 opacity-0 blur-[4px]")} />
    </Button>
  )
}

/**
 * coach-02's thumbs up and down, built and off (FEATURES.coachFeedback): Pulse stores no ratings yet, so the choice
 * stays on the screen.
 */
function RateAnswer() {
  const [rated, setRated] = React.useState<"up" | "down" | null>(null)
  return (
    <>
      {(["up", "down"] as const).map((r) => {
        const Icon = r === "up" ? ThumbsUp : ThumbsDown
        return (
          <Button key={r} type="button" variant="ghost" size="icon-lg" aria-label={r === "up" ? "Good answer" : "Bad answer"} aria-pressed={rated === r} onClick={() => setRated(rated === r ? null : r)} className={cn(ACTION, rated === r && "text-foreground")}>
            <Icon aria-hidden strokeWidth={1.75} className={cn("size-4", rated === r && "fill-current")} />
          </Button>
        )
      })}
    </>
  )
}

function UserMessage({ m, busy, onEdit }: { m: UIMessage; busy: boolean; onEdit: (text: string) => void }) {
  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
  const [draft, setDraft] = React.useState<string | null>(null)
  const editId = `edit-${m.id}`
  const save = () => {
    const t = draft?.trim()
    if (!t || busy) return
    setDraft(null)
    if (t !== text.trim()) onEdit(t)
  }
  if (draft !== null)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="ml-10 space-y-2 md:ml-16"
      >
        <label htmlFor={editId} className="sr-only">
          Edit your message
        </label>
        <textarea
          id={editId}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              setDraft(null)
            } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              save()
            }
          }}
          rows={1}
          maxLength={2000}
          className="field-sizing-content block max-h-60 min-h-11 w-full resize-none rounded-[20px] bg-secondary px-4 py-2.5 text-[16px] leading-6 text-foreground caret-coach ring-1 ring-foreground/20 outline-none focus-visible:ring-foreground/35 md:text-[15px]"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDraft(null)} className="h-9 rounded-full px-4 text-[13px] font-semibold pointer-coarse:h-10">
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !draft.trim()} className="h-9 rounded-full px-4 text-[13px] font-semibold pointer-coarse:h-10">
            Save and send
          </Button>
        </div>
      </form>
    )
  return (
    <div className="group/msg flex items-start justify-end gap-1 pl-6 md:pl-12">
      <Button type="button" variant="ghost" size="icon-lg" aria-label="Edit message" disabled={busy} onClick={() => setDraft(text)} className={cn(ACTION, REVEAL, "mt-0.5 shrink-0")}>
        <Pencil aria-hidden strokeWidth={1.75} className="size-4" />
      </Button>
      <p className="min-w-0 rounded-[20px] rounded-br-md bg-secondary px-4 py-2.5 text-[15px] leading-6 break-words whitespace-pre-wrap text-foreground">{text}</p>
    </div>
  )
}

function AssistantMessage({ m, done, onRegenerate }: { m: UIMessage; done: boolean; onRegenerate?: () => void }) {
  const text = plain(m)
  return (
    <div className="min-w-0 space-y-3">
      {m.parts.map((p, i) => (
        <PartView key={i} part={p} />
      ))}
      {done && (text || onRegenerate) && (
        <div className="-ml-2 flex items-center">
          {text && <CopyAnswer text={text} />}
          {text && FEATURES.coachFeedback && <RateAnswer />}
          {onRegenerate && (
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Regenerate answer" onClick={onRegenerate} className={ACTION}>
              <RotateCcw aria-hidden strokeWidth={1.75} className="size-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

const ERRORS: Record<string, string> = {
  limit: "Slow down a little. Try again in a moment.",
  key: "Your key stopped working. Add it again in Settings › Coach.",
  provider: "Your provider refused the request (key, quota or billing). Check your account with them.",
}

const chatsPanel = panelStore("pulse:coach-chats-open")
const usePanelOpen = chatsPanel.use
const setPanelOpen = chatsPanel.set

/** coach-02's reply chips: white pills in one scrolling row over the composer. */
const CHIP =
  "h-10 shrink-0 snap-start rounded-full bg-primary px-4 text-[14px] leading-5 font-medium whitespace-nowrap text-primary-foreground outline-none transition-[scale,opacity] duration-150 ease-standard hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"

/** coach-01's glyph: Pulse's mark in an indigo ring, the header's title icon. */
export function CoachGlyph() {
  return (
    <span className="grid size-7 place-items-center rounded-full bg-linear-to-br from-insight-from to-insight-to p-px">
      <span className="grid size-full place-items-center rounded-full bg-background">
        <Mark className="size-3.5" />
      </span>
    </span>
  )
}

export function CoachBarActions({ chatCount, chatOpen }: { chatCount: number; chatOpen: boolean }) {
  const btn = "text-foreground-secondary hover:text-foreground"
  return (
    <span className="flex items-center xl:hidden">
      <Button asChild variant="ghost" size="icon-touch" aria-label={chatCount ? `Chats (${chatCount})` : "Chats"} className={btn}>
        <Link href="/coach/chats">
          <History aria-hidden strokeWidth={1.75} />
        </Link>
      </Button>
      {chatOpen && <NewChatButton />}
      <Button asChild variant="ghost" size="icon-touch" aria-label="Coach settings" className={btn}>
        <Link href="/settings?s=coach">
          <Settings2 aria-hidden strokeWidth={1.6} />
        </Link>
      </Button>
    </span>
  )
}

export function Coach({
  id,
  initial,
  groups,
  next,
  prefill,
  auto,
  opener,
  suggestions,
}: {
  id: string
  initial: UIMessage[]
  groups: ChatGroup[]
  next: ChatCursor | null
  prefill: string
  auto: boolean
  /** The day's first chat: the coach speaks first (coach-02). */
  opener: boolean
  suggestions: CoachSuggestion[]
}) {
  const router = useRouter()
  const [input, setInput] = React.useState(prefill)
  const [error, setError] = React.useState<string | null>(null)
  const area = React.useRef<HTMLTextAreaElement>(null)
  const transcript = React.useRef<HTMLDivElement>(null)
  const { messages, sendMessage, regenerate, status, stop } = useChat({
    id,
    messages: initial,
    throttle: 50,
    transport: new DefaultChatTransport({
      api: "/api/coach",
      // Send only the newest message: the server replays its saved history.
      prepareSendMessagesRequest: ({ messages, id, trigger, messageId }) => ({ body: { id, message: messages.at(-1), trigger, messageId } }),
    }),
    onError: (e) => setError(ERRORS[/\b(limit|key|provider)\b/.exec(e.message)?.[1] ?? ""] ?? "Couldn’t get an answer. Try again."),
    onFinish: ({ message, messages: all }) => {
      // Announce completed answers once; saved chats must not be read again on load.
      setAnnounce(plain(message))
      const asked = all.filter((m) => m.role === "user" && !(m.metadata as { coachOpener?: unknown } | undefined)?.coachOpener).length
      if (initial.length === 0 && all.length <= 2) router.replace(`/coach?c=${id}`, { scroll: false })
      // The first question names the chat (an opened chat is "Today with Coach" until then): refresh the list.
      else if (asked === 1 && all.some((m) => (m.metadata as { coachOpener?: unknown } | undefined)?.coachOpener)) router.refresh()
    },
  })
  const [announce, setAnnounce] = React.useState("")
  const busy = status === "submitted" || status === "streaming"

  // Pinned to the newest message: a saved chat opens at its end, and a growing answer, a late-rendering chart or the
  // keyboard resizing the frame keep it there. Scrolling up unpins; scrolling back to the end pins again.
  const pinned = React.useRef(true)
  React.useEffect(() => {
    const scroller = transcript.current
    pinned.current = true
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [messages.length, status])

  React.useLayoutEffect(() => {
    const scroller = transcript.current
    if (!scroller) return
    const toEnd = () => {
      if (pinned.current) scroller.scrollTop = scroller.scrollHeight
    }
    const onScroll = () => {
      pinned.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 24
    }
    // The transcript's own size (the keyboard) and its direct children's (a growing answer, a late chart); a new direct
    // child (the log replacing the empty state, an error) is watched as it arrives.
    const observer = new ResizeObserver(toEnd)
    const watch = () => {
      observer.observe(scroller)
      for (const child of scroller.children) observer.observe(child)
    }
    const added = new MutationObserver(() => {
      watch()
      toEnd()
    })
    watch()
    toEnd()
    added.observe(scroller, { childList: true })
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      observer.disconnect()
      added.disconnect()
      scroller.removeEventListener("scroll", onScroll)
    }
  }, [])

  const send = (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setError(null)
    setInput("")
    void sendMessage({ text: t })
    area.current?.focus({ preventScroll: true })
  }
  // Opening the morning notification authorizes one brief request; the day's first chat opens with the coach's own
  // turn, which the server writes and the screen never shows.
  // Sent from a timeout the cleanup cancels: React's development double mount drops a request sent during the first
  // mount, and a guard set then would block the second.
  const asked = React.useRef(false)
  React.useEffect(() => {
    if (asked.current || messages.length || !(auto || opener)) return
    const t = setTimeout(() => {
      asked.current = true
      if (auto) send(prefill)
      else void sendMessage({ text: "opener", metadata: { coachOpener: true } })
    })
    return () => clearTimeout(t)
  })
  const edit = (messageId: string, text: string) => {
    if (busy) return
    setError(null)
    void sendMessage({ text, messageId })
  }
  const again = (messageId?: string) => {
    if (busy) return
    setError(null)
    void regenerate(messageId ? { messageId } : undefined)
  }
  const lastAnswer = messages.at(-1)?.role === "assistant" ? messages.at(-1)!.id : null
  const shown = messages.filter((m) => !(m.metadata as { coachOpener?: unknown } | undefined)?.coachOpener)
  // Reply chips: the suggestions not asked yet, on an empty chat and after each finished answer.
  const askedTexts = new Set(shown.flatMap((m) => (m.role === "user" ? [plain(m)] : [])))
  const chips = busy || (shown.length > 0 && shown.at(-1)!.role !== "assistant") ? [] : suggestions.filter((s) => !askedTexts.has(s.text))

  const listOpen = usePanelOpen()
  const PANEL_BTN = "rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
  const settingsLink = (className: string, size: "icon-lg" | "icon-touch") => (
    <Button asChild variant="ghost" size={size} aria-label="Coach settings" className={className}>
      <Link href="/settings?s=coach">
        <Settings2 aria-hidden strokeWidth={1.6} className={size === "icon-lg" ? "size-[18px]" : undefined} />
      </Link>
    </Button>
  )
  return (
    <div data-chats={listOpen ? "open" : "closed"} className="flex min-h-0 flex-1 flex-col">
      {listOpen ? (
        <aside data-fixed-panel aria-label="Chats panel" className={cn(GLASS, "fixed top-[calc(var(--inset-top)+12px)] bottom-3 left-[112px] z-30 hidden w-[272px] flex-col rounded-[28px] p-3 xl:flex")}>
          <div className="flex h-14 shrink-0 items-center justify-between gap-1 pl-3">
            <h2 className="text-[15px] leading-5 font-semibold">Chats</h2>
            <span className="flex items-center">
              {settingsLink(PANEL_BTN, "icon-lg")}
              <Button variant="ghost" size="icon-lg" aria-label="Collapse chats" aria-expanded onClick={() => setPanelOpen(false)} className={PANEL_BTN}>
                <PanelLeftClose aria-hidden strokeWidth={1.6} className="size-[18px]" />
              </Button>
            </span>
          </div>
          <NewChatButton label />
          <div aria-hidden className="mx-3 my-2 h-px shrink-0 bg-foreground/8" />
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-none px-1 pb-1">
            <ChatList groups={groups} next={next} current={initial.length ? id : null} showNew={false} />
          </div>
        </aside>
      ) : (
        <aside data-fixed-panel aria-label="Chats panel" className={cn(GLASS, "fixed top-[calc(var(--inset-top)+12px)] bottom-3 left-[112px] z-30 hidden w-16 flex-col items-center gap-1 rounded-[28px] py-3 xl:flex")}>
          <Button variant="ghost" size="icon-touch" aria-label="Expand chats" aria-expanded={false} onClick={() => setPanelOpen(true)} className={PANEL_BTN}>
            <PanelLeftOpen aria-hidden strokeWidth={1.6} />
          </Button>
          <NewChatButton className={PANEL_BTN} />
          <div aria-hidden className="my-1 h-px w-8 bg-foreground/8" />
          {settingsLink(PANEL_BTN, "icon-touch")}
        </aside>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col pb-[max(env(safe-area-inset-bottom),12px)] in-data-keyboard:pb-2 md:pb-6">
        <div ref={transcript} data-coach-transcript className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none pb-6">
          {shown.length === 0 && !busy ? (
            <div className="my-auto flex flex-col items-center py-8 text-center">
              <span aria-hidden className="grid size-12 place-items-center rounded-full bg-linear-to-br from-insight-from to-insight-to p-px">
                <span className="grid size-full place-items-center rounded-full bg-background">
                  <Mark className="size-5" />
                </span>
              </span>
              <h2 className="mt-5 text-[22px] leading-7 font-bold tracking-[-0.01em] text-balance md:text-[26px] md:leading-8">What would you like to know?</h2>
              <SheetTrigger
                sheet="checkin"
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium text-foreground-secondary outline-none transition-[background-color,color,scale] duration-150 ease-standard hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
              >
                <NotebookPen aria-hidden className="size-4" strokeWidth={1.75} />
                Check in for today
              </SheetTrigger>
            </div>
          ) : (
            <div role="log" aria-label="Chat with Pulse’s coach" className="mt-2 space-y-7">
              {shown.map((m, i) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} m={m} busy={busy} onEdit={(text) => edit(m.id, text)} />
                ) : (
                  <AssistantMessage key={m.id} m={m} done={!busy || i < shown.length - 1} onRegenerate={!busy && m.id === lastAnswer ? () => again(m.id) : undefined} />
                ),
              )}
              {status === "submitted" && <Caption live>Thinking…</Caption>}
            </div>
          )}

          {/* The finished answer, once, for screen readers (not every token). */}
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>

          {error && (
            <div role="alert" className="mt-6 flex items-center gap-3 rounded-xl bg-recovery-red/12 py-2 pr-2 pl-4 ring-1 ring-recovery-red/25">
              <p className="min-w-0 flex-1 py-1 text-[14px] leading-5 text-pretty text-foreground">{error}</p>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => again()} className="h-9 shrink-0 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold hover:bg-foreground/8 pointer-coarse:h-10">
                <RotateCcw aria-hidden strokeWidth={1.75} className="size-4" />
                Retry
              </Button>
            </div>
          )}
        </div>

        <div className="z-20 shrink-0 pt-2">
          {chips.length > 0 && (
            <ul aria-label="Suggested replies" className="-mx-4 mb-3 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] md:mx-0 md:px-0">
              {chips.map(({ text }) => (
                <li key={text}>
                  <button type="button" onClick={() => send(text)} className={CHIP}>
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
          <NewChatButton composer />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className={cn(
              GLASS,
              "flex min-w-0 flex-1 items-end gap-1.5 rounded-[28px] p-1.5 ring-coach/40 transition-[box-shadow] duration-150 ease-standard has-[textarea:focus-visible]:ring-foreground/25",
            )}
          >
            <label htmlFor="coach-input" className="sr-only">
              Ask Coach
            </label>
            <textarea
              id="coach-input"
              ref={area}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              maxLength={2000}
              enterKeyHint="send"
              placeholder="Ask Pulse anything"
              className="field-sizing-content max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 pl-3.5 text-[16px] leading-6 text-foreground caret-coach outline-none placeholder:text-muted-foreground"
            />
            {busy ? (
              <Button type="button" size="icon-touch" variant="secondary" onClick={() => stop()} aria-label="Stop">
                <Square aria-hidden className="size-3.5 fill-current" />
              </Button>
            ) : FEATURES.coachVoice && !input.trim() ? (
              // coach-02's microphone, built and off (FEATURES.coachVoice): Pulse has no speech input yet.
              <Button type="button" size="icon-touch" variant="ghost" aria-label="Dictate" className="text-foreground-secondary">
                <Mic aria-hidden strokeWidth={1.75} />
              </Button>
            ) : (
              <Button type="submit" size="icon-touch" disabled={!input.trim()} aria-label="Send">
                <ArrowUp aria-hidden strokeWidth={2.25} />
              </Button>
            )}
          </form>
          </div>
        </div>
      </div>
    </div>
  )
}
