"use client"

import * as React from "react"
import { LoaderCircle, Search } from "lucide-react"
import { BEHAVIOR_CATEGORIES, BEHAVIORS, type BehaviorCategory, questionOf } from "@/lib/behaviors"
import { loadBehaviours, saveBehaviors } from "@/server/actions/journal"
import type { BehavioursVM } from "@/server/queries/types"
import { ResponsiveSheet, SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Tab = "all" | BehaviorCategory | "custom"
type Item = { key: string; label: string; question: string; category: BehaviorCategory | "custom" }

/** The catalogue A to Z, then the user's own behaviours. */
const itemsOf = (tags: BehavioursVM["tags"]): Item[] => [
  ...BEHAVIORS.map((b) => ({ key: b.key, label: b.label, question: b.question, category: b.category })),
  ...tags.filter((t) => t.section === "custom").map((t) => ({ key: t.tag, label: t.label, question: questionOf(t.tag, t.label), category: "custom" as const })),
]

/** What the journal asks today: every behaviour the user has and hasn't hidden. */
export const shownOf = (tags: BehavioursVM["tags"]) => new Set(tags.filter((t) => !t.hidden).map((t) => t.tag))

/**
 * Select Behaviors (journal-04..09): search, category tabs, then the chosen behaviours above a "Not selected" rule,
 * each a name, its daily question and a checkbox. The two groups are split as the picker opened, so ticking a row
 * doesn't move it. Nothing is written until the host saves `selected`.
 */
export function BehaviorPicker({ tags, initial, selected, onChange }: { tags: BehavioursVM["tags"]; initial: Set<string>; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const [query, setQuery] = React.useState("")
  const [tab, setTab] = React.useState<Tab>("all")
  const items = itemsOf(tags)
  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    ...BEHAVIOR_CATEGORIES,
    ...(items.some((i) => i.category === "custom") ? [{ key: "custom" as const, label: "Yours" }] : []),
  ]
  const q = query.trim().toLowerCase()
  const shown = items.filter((i) => (tab === "all" || i.category === tab) && (!q || i.label.toLowerCase().includes(q) || i.question.toLowerCase().includes(q)))
  const groups = [
    { key: "selected", title: "Selected", rows: shown.filter((i) => initial.has(i.key)) },
    { key: "not-selected", title: "Not selected", rows: shown.filter((i) => !initial.has(i.key)) },
  ]
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(key)
    else next.delete(key)
    onChange(next)
  }

  return (
    <div>
      <div className="relative">
        <Search aria-hidden strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for behaviours"
          aria-label="Search for behaviours"
          autoComplete="off"
          className="h-12 rounded-xl bg-foreground/[0.06] pl-11 text-base"
        />
      </div>
      {/* Category tabs in one scrolling row, the chosen one underlined (journal-04, journal-06). */}
      <div className="mt-3 overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [scrollbar-width:none] max-md:-mx-4">
        <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as Tab)} aria-label="Category" spacing={0} className="w-max gap-1 pr-8 max-md:px-4">
          {tabs.map((t) => (
            <ToggleGroupItem
              key={t.key}
              value={t.key}
              className="relative h-11 rounded-none! bg-transparent! px-2.5 text-xs leading-4 font-bold tracking-[0.1em] whitespace-nowrap text-muted-foreground uppercase after:absolute after:inset-x-2.5 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity data-[state=on]:text-foreground data-[state=on]:after:opacity-100"
            >
              {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {shown.length === 0 && <p className="py-8 text-center text-[15px] leading-[22px] text-foreground-secondary">No behaviours match “{query.trim()}”.</p>}
      {groups.map(
        (g) =>
          g.rows.length > 0 && (
            <section key={g.key} aria-labelledby={`behaviours-${g.key}`} className="mt-4">
              <h3 id={`behaviours-${g.key}`} className={SHEET_SECTION}>
                {g.title}
              </h3>
              <ul className="mt-1">
                {g.rows.map((i) => {
                  const id = `behaviour-${i.key}`
                  return (
                    <li key={i.key}>
                      <label htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-4 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[17px] leading-6 font-semibold">{i.label}</span>
                          <span className="block text-[15px] leading-[22px] text-muted-foreground">{i.question}</span>
                        </span>
                        <Checkbox
                          id={id}
                          checked={selected.has(i.key)}
                          onCheckedChange={(c) => toggle(i.key, c === true)}
                          className="size-7 rounded-lg border-2 border-foreground/80 bg-transparent! data-checked:border-answer-yes data-checked:bg-answer-yes! data-checked:text-on-color [&_svg]:size-4!"
                        />
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
      )}
    </div>
  )
}

/** Saves a selection; the error copy the two hosts show. */
export async function saveSelection(selected: Set<string>): Promise<string | null> {
  const r = await saveBehaviors({ tags: [...selected] }).catch(() => ({ ok: false as const, error: "network" }))
  return r.ok ? null : r.error.startsWith("Too many") ? "That’s more behaviours than Pulse can track. Choose fewer." : "Couldn’t save. Check your connection and try again."
}

/** The Journal's pencil (journal-04): Select Behaviors over the journal. `onSaved` reloads the journal's questions. */
export function SelectBehaviorsSheet({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [tags, setTags] = React.useState<BehavioursVM["tags"] | null>(null)
  const [initial, setInitial] = React.useState<Set<string>>(new Set())
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Each opening starts from what is saved (reset while rendering, not in the effect).
  const [seen, setSeen] = React.useState(false)
  if (open !== seen) {
    setSeen(open)
    if (open) {
      setTags(null)
      setError(null)
    }
  }

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadBehaviours()
      .then((r) => {
        if (!live) return
        if (!r.ok) return setError("Couldn’t load your behaviours.")
        setTags(r.data.tags)
        setInitial(shownOf(r.data.tags))
        setSelected(shownOf(r.data.tags))
      })
      .catch(() => live && setError("Couldn’t load your behaviours."))
    return () => {
      live = false
    }
  }, [open])

  const save = async () => {
    setSaving(true)
    const e = await saveSelection(selected)
    setSaving(false)
    if (e) return setError(e)
    onOpenChange(false)
    onSaved()
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Select behaviours"
      size="tall"
      footer={
        <>
          {error && tags && (
            <Alert role="alert" className="border-0 bg-recovery-red/15 px-3 py-2">
              <AlertDescription className="text-recovery-red-text">{error}</AlertDescription>
            </Alert>
          )}
          <Button size="sheet" variant="outline-pill" onClick={save} disabled={saving || !tags}>
            {saving ? "Saving…" : "Save behaviours"}
          </Button>
        </>
      }
    >
      {tags ? (
        <BehaviorPicker tags={tags} initial={initial} selected={selected} onChange={setSelected} />
      ) : error ? (
        <p role="alert" className="py-8 text-center text-[15px] leading-[22px] text-recovery-red-text">
          {error}
        </p>
      ) : (
        <div role="status" aria-label="Loading" className="grid place-items-center py-16">
          <LoaderCircle aria-hidden className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" strokeWidth={2} />
        </div>
      )}
    </ResponsiveSheet>
  )
}
