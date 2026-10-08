"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp } from "lucide-react"
import { toast } from "sonner"
import { cn, moved } from "@/lib/utils"
import { JOURNAL_SECTIONS } from "@/lib/behaviors"
import { tagIcon } from "@/lib/journal"
import { addCustomTag, reorderBehaviours, setBehaviourHidden } from "@/server/actions/journal"
import type { BehavioursVM } from "@/server/queries/types"
import { SectionShell } from "@/components/shells/SectionShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type Tag = BehavioursVM["tags"][number]

/**
 * More › Behaviours (U21): show or hide each behaviour on the check-in sheet, reorder it inside its group, add your
 * own. The list updates in place; a failed write puts it back and says so.
 */
export function Behaviours({ vm }: { vm: BehavioursVM }) {
  const router = useRouter()
  const [tags, setTags] = React.useState(vm.tags)
  // Server data wins when it changes (after a refresh), without an effect.
  const [last, setLast] = React.useState(vm.tags)
  if (vm.tags !== last) {
    setLast(vm.tags)
    setTags(vm.tags)
  }
  const [label, setLabel] = React.useState("")
  const [addError, setAddError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  // An invalid name keeps focus on the field, so the error under it is read out and fixable in place.
  const invalid = (message: string) => {
    setAddError(message)
    input.current?.focus()
  }

  const write = async (optimistic: Tag[], action: () => Promise<{ ok: boolean }>) => {
    const before = tags
    setTags(optimistic)
    const r = await action().catch(() => ({ ok: false }))
    if (!r.ok) {
      setTags(before)
      toast.error("Couldn’t save. Try again.")
      return
    }
    router.refresh()
  }

  const toggle = (t: Tag, shown: boolean) =>
    write(
      tags.map((x) => (x.tag === t.tag ? { ...x, hidden: !shown } : x)),
      () => setBehaviourHidden({ tag: t.tag, hidden: !shown })
    )

  const move = (group: Tag[], i: number, by: -1 | 1) => {
    const order = moved(group, i, by)
    const rank = new Map(order.map((t, k) => [t.tag, k]))
    const next = [...tags].sort((a, b) => (rank.get(a.tag) ?? -1) - (rank.get(b.tag) ?? -1) || 0)
    // Only this group's relative order changes; other groups keep theirs (they render apart).
    return write(next, () => reorderBehaviours({ tags: order.map((t) => t.tag) }))
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = label.trim()
    if (!name) return
    if (name.length > 32) return invalid("Use 32 characters or fewer.")
    if (tags.some((t) => t.label.toLowerCase() === name.toLowerCase())) return invalid("That behaviour already exists.")
    setAdding(true)
    const r = await addCustomTag({ label: name }).catch(() => ({ ok: false as const, error: "network" }))
    setAdding(false)
    if (!r.ok) return invalid(r.error.startsWith("Tag already exists") ? "That behaviour already exists." : r.error.startsWith("Too many") ? "You’ve reached the behaviour limit." : "Couldn’t add it. Try again.")
    setAddError(null)
    setLabel("")
    toast.success(`${name} added`)
    router.refresh()
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
      <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
        Choose what the check-in asks. A hidden behaviour leaves the check-in, but its past answers stay and still count in your insights.
      </p>
      {JOURNAL_SECTIONS.map((g) => {
        const group = tags.filter((t) => t.section === g.key)
        if (!group.length && g.key !== "custom") return null
        return (
          <SectionShell key={g.key} variant="card" level={2} title={g.title} id={`group-${g.key}`}>
            {group.length > 0 ? (
              <ul className="divide-y divide-border">
                {group.map((t, i) => {
                  const Icon = tagIcon(t.tag)
                  const switchId = `show-${t.tag}`
                  return (
                    <li key={t.tag} className="flex min-h-14 items-center gap-2 py-1.5">
                      <Icon aria-hidden className={cn("size-5 shrink-0 text-muted-foreground", t.hidden && "opacity-50")} strokeWidth={1.75} />
                      <Label htmlFor={switchId} className="ml-1 min-w-0 flex-1 flex-col items-start gap-0 font-normal">
                        <span className={cn("text-[15px] leading-[22px] text-balance", t.hidden && "text-muted-foreground")}>{t.label}</span>
                        <span className="text-xs leading-4 font-medium text-muted-foreground tabular-nums">
                          {t.hidden ? "Hidden" : t.answers ? `${t.answers}\u00a0${t.answers === 1 ? "day" : "days"} logged` : "Not logged yet"}
                        </span>
                      </Label>
                      {group.length > 1 && (
                        <span className="flex shrink-0">
                          <Button variant="ghost" size="icon-touch" aria-label={`Move ${t.label} up`} disabled={i === 0} onClick={() => move(group, i, -1)}>
                            <ArrowUp strokeWidth={1.75} />
                          </Button>
                          <Button variant="ghost" size="icon-touch" aria-label={`Move ${t.label} down`} disabled={i === group.length - 1} onClick={() => move(group, i, 1)}>
                            <ArrowDown strokeWidth={1.75} />
                          </Button>
                        </span>
                      )}
                      <Switch id={switchId} checked={!t.hidden} onCheckedChange={(on) => toggle(t, on)} aria-label={`Show ${t.label} in the check-in`} className="mx-1" />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-[15px] leading-[22px] text-foreground-secondary">None yet. Add one below.</p>
            )}
            {g.key === "custom" && (
              <form onSubmit={add} className="mt-4 space-y-2 border-t border-border pt-4" noValidate>
                <Label htmlFor="new-behaviour" className="text-[15px] leading-[22px] font-medium">
                  Add a behaviour
                </Label>
                <div className="flex gap-2">
                  <Input
                    ref={input}
                    id="new-behaviour"
                    name="behaviour"
                    enterKeyHint="done"
                    value={label}
                    onChange={(e) => {
                      setLabel(e.target.value)
                      setAddError(null)
                    }}
                    placeholder="e.g. Cold shower…"
                    autoComplete="off"
                    maxLength={32}
                    aria-invalid={!!addError}
                    aria-describedby={addError ? "new-behaviour-error" : undefined}
                    className="h-11 min-w-0 flex-1 text-base"
                  />
                  {/* "Add" fits beside the field on a phone; the name says what it adds (label in name). */}
                  <Button type="submit" variant="secondary" size="touch" disabled={adding || !label.trim()} aria-label={adding ? undefined : "Add behaviour"}>
                    {adding ? "Adding…" : "Add"}
                  </Button>
                </div>
                {addError && (
                  <p id="new-behaviour-error" role="alert" className="text-xs leading-4 font-medium text-recovery-red-text">
                    {addError}
                  </p>
                )}
              </form>
            )}
          </SectionShell>
        )
      })}
    </div>
  )
}
