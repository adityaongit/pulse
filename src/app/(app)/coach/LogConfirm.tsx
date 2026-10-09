"use client"

import { Check, X } from "lucide-react"
import { describeEntry, RECONNECT, type LogToolName, type LogType } from "@/lib/log"
import { cn } from "@/lib/utils"
import type { LogOutput } from "@/server/coach/logTools"
import { Button } from "@/components/ui/button"
import { CARD_MATERIAL } from "@/components/ui/card"

type Input = Record<string, unknown> & { at?: string }

const ENTRY: Record<LogToolName, (i: Input) => [LogType, unknown]> = {
  log_water: (i) => ["hydration-log", { ml: i.ml }],
  log_food: (i) => ["nutrition-log", { name: i.name || null, meal: i.meal, kcal: i.kcal, protein: i.protein ?? null, carbs: i.carbs ?? null, fat: i.fat ?? null }],
  log_weight: (i) => ["weight", { kg: i.kg }],
  log_mood: (i) => ["moods", { moods: i.moods ?? [], valence: i.valence ?? null }],
  log_symptoms: (i) => ["symptoms", { symptoms: i.symptoms ?? [] }],
  log_period: (i) => ["menstrual-period", { start: i.start, end: i.end, flow: i.flow ?? null }],
  log_ovulation: (i) => ["ovulation-test", { result: i.result }],
}

/** The entry as the log list would show it, plus when. */
export function logPreview(name: LogToolName, input: Input): { title: string; detail: string; when: string } {
  const [type, data] = ENTRY[name](input)
  const d = describeEntry(type, data)
  const fat = name === "log_weight" && typeof input.fatPct === "number" ? `, ${input.fatPct}% body fat` : ""
  const when = name === "log_period" ? `${input.start} to ${input.end}` : input.at ? input.at.replace("T", " at ") : "Now"
  return { title: d.title, detail: d.detail + fat, when }
}

export type LogPart = {
  state: string
  input?: unknown
  output?: unknown
  approval?: { id: string; approved?: boolean; isAutomatic?: boolean }
}

function Status({ tone, children }: { tone: "done" | "off" | "live"; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
      {tone === "done" ? <Check aria-hidden className="size-3.5 text-recovery-green" strokeWidth={2.25} /> : tone === "off" ? <X aria-hidden className="size-3.5" strokeWidth={2} /> : <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-coach motion-reduce:animate-none" />}
      {children}
    </p>
  )
}

/**
 * A log tool call in the chat: a card to confirm while it waits (only on the newest answer; older open ones were
 * answered by moving on), then what happened to it.
 */
export function LogConfirm({ name, part, onAnswer }: { name: LogToolName; part: LogPart; onAnswer?: (id: string, approved: boolean) => void }) {
  if (part.state === "input-streaming" || part.state === "input-available") return <Status tone="live">Preparing the entry…</Status>
  const p = logPreview(name, (part.input ?? {}) as Input)
  const line = `${p.title} · ${p.detail}`
  if (part.state === "output-available") {
    const out = part.output as LogOutput
    if (!out.logged) return <Status tone="off">Not logged: {out.error === RECONNECT ? "reconnect Google in Settings to allow logging." : out.error}</Status>
    return <Status tone="done">Logged {line}</Status>
  }
  if (part.state === "output-error") return <Status tone="off">Couldn’t log {line}.</Status>
  if (part.state === "output-denied" || (part.state === "approval-responded" && !part.approval?.approved)) return <Status tone="off">Not logged: {line}</Status>
  if (part.state === "approval-responded") return <Status tone="live">Logging {line}…</Status>
  if (part.state !== "approval-requested" || !part.approval) return null
  const { id } = part.approval
  return (
    <div role="group" aria-label={`Log ${p.title}?`} className={cn(CARD_MATERIAL, "px-4 py-3")}>
      <p className="text-[12px] leading-4 font-semibold text-foreground-secondary">Log this?</p>
      <p className="mt-1 text-[15px] leading-6 font-semibold text-foreground">{p.title}</p>
      <p className="text-[14px] leading-5 text-foreground-secondary">{p.detail}</p>
      <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">{p.when}</p>
      {onAnswer ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" onClick={() => onAnswer(id, true)} className="h-9 rounded-full px-4 text-[13px] font-semibold pointer-coarse:h-10">
            Log
          </Button>
          <Button type="button" variant="ghost" onClick={() => onAnswer(id, false)} className="h-9 rounded-full px-4 text-[13px] font-semibold pointer-coarse:h-10">
            Don’t log
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">Not logged.</p>
      )}
    </div>
  )
}
