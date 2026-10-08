"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { addCustomTag } from "@/server/actions/journal"
import type { BehavioursVM } from "@/server/queries/types"
import { SectionShell } from "@/components/shells/SectionShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BehaviorPicker, saveSelection, shownOf } from "./SelectBehaviors"

/**
 * More › Behaviours (U21, journal-04..09): choose what the journal asks from the catalogue and your own behaviours,
 * then save; add your own. A behaviour left out keeps its past answers, which still count in insights.
 */
export function Behaviours({ vm }: { vm: BehavioursVM }) {
  const router = useRouter()
  const [initial, setInitial] = React.useState(() => shownOf(vm.tags))
  const [selected, setSelected] = React.useState(initial)
  // Server data wins when it changes (after a save or an add), without an effect.
  const [last, setLast] = React.useState(vm.tags)
  if (vm.tags !== last) {
    setLast(vm.tags)
    const shown = shownOf(vm.tags)
    setInitial(shown)
    setSelected((s) => new Set([...s, ...[...shown].filter((t) => !initial.has(t))]))
  }
  const dirty = selected.size !== initial.size || [...selected].some((t) => !initial.has(t))
  const [saving, setSaving] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [addError, setAddError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  // An invalid name keeps focus on the field, so the error under it is read out and fixable in place.
  const invalid = (message: string) => {
    setAddError(message)
    input.current?.focus()
  }

  const save = async () => {
    setSaving(true)
    const e = await saveSelection(selected)
    setSaving(false)
    if (e) return void toast.error(e)
    toast.success("Behaviours saved")
    router.refresh()
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = label.trim()
    if (!name) return
    if (name.length > 32) return invalid("Use 32 characters or fewer.")
    if (vm.tags.some((t) => t.label.toLowerCase() === name.toLowerCase())) return invalid("That behaviour already exists.")
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
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
        Choose what your journal asks. A behaviour you leave out keeps its past answers, and they still count in your insights.
      </p>
      <BehaviorPicker tags={vm.tags} initial={initial} selected={selected} onChange={setSelected} />
      {/* Pinned over the list once something changed, clear of the round action at the phone's foot. */}
      {(dirty || saving) && (
        <div className="sticky bottom-[max(calc(env(safe-area-inset-bottom)+84px),96px)] z-10 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out-expo md:bottom-6">
          <Button size="sheet" className="w-full shadow-lg" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save behaviours"}
          </Button>
        </div>
      )}
      <SectionShell variant="card" level={2} title="Your own">
        <form onSubmit={add} className="space-y-2" noValidate>
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
      </SectionShell>
    </div>
  )
}
