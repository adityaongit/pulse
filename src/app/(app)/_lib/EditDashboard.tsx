"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Minus, Pencil, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { cn, moved } from "@/lib/utils"
import { DASHBOARD_GROUPS, DASHBOARD_LABEL, DASHBOARD_METRICS, type DashboardKey } from "@/lib/dashboard"
import { saveDashboard } from "@/server/actions/dashboard"
import { ResponsiveSheet, SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STAT_ICON } from "./view"

export type EditDashboardProps = {
  /** The metrics on Home now, in order. */
  keys: DashboardKey[]
  /** What Reset to default restores (the v1 rows, or phone metrics without a band). */
  defaults: DashboardKey[]
  /** Metrics with no value in the last 30 days: still addable, marked "No data yet". */
  empty?: DashboardKey[]
}

const ROW = "flex min-h-14 items-center gap-3 border-b border-border"
const ICON = "grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]"
const GROUP_LABEL = Object.fromEntries(DASHBOARD_GROUPS.map((g) => [g.key, g.label])) as Record<string, string>
const same = (a: DashboardKey[], b: DashboardKey[]) => a.length === b.length && a.every((k, i) => k === b[i])

/**
 * Home › My Dashboard's pencil (spec §11 CD1, CD2): the reference app's two lists. "On Home" holds the shown metrics in order, each
 * with Move up / Move down and Remove; "Add to My Dashboard" holds the rest by group (Recovery & sleep, Activity, Body,
 * Nutrition, Vitals) with a search field, and a tap adds a metric to the end. Save stores the list; Reset to default
 * restores `defaults`.
 */
export function EditDashboard({ keys, defaults, empty = [] }: EditDashboardProps) {
  const [open, setOpen] = React.useState(false)
  const [shown, setShown] = React.useState(keys)
  const [query, setQuery] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [status, setStatus] = React.useState("")
  // The control that takes focus after a row leaves its list (its own button is gone).
  const focusNext = React.useRef<string | null>(null)
  const search = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (focusNext.current === null) return
    ;(document.getElementById(focusNext.current) ?? search.current)?.focus()
    focusNext.current = null
  })

  const q = query.trim().toLowerCase()
  const hidden = DASHBOARD_METRICS.filter((m) => !shown.includes(m.key))
  const matches = hidden.filter((m) => !q || m.label.toLowerCase().includes(q) || GROUP_LABEL[m.group].toLowerCase().includes(q))
  const groups = DASHBOARD_GROUPS.map((g) => ({ ...g, items: matches.filter((m) => m.group === g.key) })).filter((g) => g.items.length)
  const noData = new Set(empty)

  const start = () => {
    setShown(keys)
    setQuery("")
    setStatus("")
    setOpen(true)
  }
  const move = (i: number, by: -1 | 1) => {
    setShown(moved(shown, i, by))
    setStatus(`${DASHBOARD_LABEL[shown[i]]} moved to position ${i + by + 1} of ${shown.length}`)
  }
  const remove = (i: number) => {
    const next = shown.filter((_, j) => j !== i)
    setShown(next)
    setStatus(`${DASHBOARD_LABEL[shown[i]]} removed from Home`)
    const after = next[Math.min(i, next.length - 1)]
    focusNext.current = after ? `dashboard-remove-${after}` : "dashboard-search"
  }
  const add = (key: DashboardKey) => {
    const i = matches.findIndex((m) => m.key === key)
    setShown([...shown, key])
    setStatus(`${DASHBOARD_LABEL[key]} added at position ${shown.length + 1}`)
    const after = matches[i + 1] ?? matches[i - 1]
    focusNext.current = after ? `dashboard-add-${after.key}` : "dashboard-search"
  }
  const save = async () => {
    setSaving(true)
    const r = await saveDashboard({ keys: shown }).catch(() => ({ ok: false as const, error: "network" }))
    setSaving(false)
    if (!r.ok) return void toast.error("Couldn’t save your dashboard. Try again.")
    setOpen(false)
    toast.success("Dashboard saved")
  }

  return (
    <>
      {/* the reference app's "CUSTOMIZE" with a pencil at the section header's right (home-12). */}
      <Button
        variant="ghost"
        aria-label="Customize My Dashboard"
        onClick={start}
        className="relative -mr-2 h-8 gap-1.5 rounded-full px-2 text-xs leading-4 font-bold tracking-[0.1em] text-foreground uppercase after:absolute after:-inset-y-1.5 hover:bg-foreground/[0.06]"
      >
        Customize
        <Pencil aria-hidden strokeWidth={1.75} className="size-4" />
      </Button>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="My Dashboard"
        description="Choose the metrics on Home and their order."
        size="tall"
        footer={
          <>
            <Button size="sheet" onClick={save} disabled={saving || shown.length === 0} aria-describedby={shown.length === 0 ? "dashboard-none" : undefined}>
              {saving ? "Saving…" : "Save dashboard"}
            </Button>
            <Button size="sheet" variant="outline-pill" onClick={() => setShown(defaults)} disabled={saving || same(shown, defaults)}>
              Reset to default
            </Button>
          </>
        }
      >
        <h3 id="dashboard-shown" className={cn(SHEET_SECTION, "mt-2")}>
          On Home <span className="font-numeric tabular-nums">{shown.length}</span>
        </h3>
        {shown.length === 0 ? (
          <p id="dashboard-none" role="alert" className="py-4 text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            Add at least one metric to save.
          </p>
        ) : (
          <ul aria-labelledby="dashboard-shown">
            {shown.map((key, i) => {
              const label = DASHBOARD_LABEL[key]
              return (
                <li key={key} className={cn(ROW, "gap-1")}>
                  <span aria-hidden className={cn(ICON, "mr-2")}>
                    {STAT_ICON[key]}
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] leading-[22px] text-balance">{label}</span>
                  <Button variant="ghost" size="icon-touch" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp strokeWidth={1.75} />
                  </Button>
                  <Button variant="ghost" size="icon-touch" aria-label={`Move ${label} down`} disabled={i === shown.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown strokeWidth={1.75} />
                  </Button>
                  {/* the reference app hides removal behind a swipe that members could not find; Pulse shows it (spec §11 CD2). */}
                  <Button
                    id={`dashboard-remove-${key}`}
                    variant="ghost"
                    size="icon-touch"
                    aria-label={`Remove ${label}`}
                    onClick={() => remove(i)}
                    className="text-foreground-secondary hover:text-foreground"
                  >
                    <span className="grid size-6 place-items-center rounded-full ring-1 ring-current">
                      <Minus className="size-3.5" strokeWidth={2.25} />
                    </span>
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        <h3 id="dashboard-add" className={cn(SHEET_SECTION, "mt-8")}>
          Add to My Dashboard
        </h3>
        <div className="relative mt-3">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <Input
            ref={search}
            id="dashboard-search"
            name="metric-search"
            spellCheck={false}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search metrics…"
            aria-label="Search metrics"
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 rounded-full bg-secondary pl-10 text-base dark:bg-secondary"
          />
        </div>
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`dashboard-group-${g.key}`} className="mt-5">
            <h4 id={`dashboard-group-${g.key}`} className="text-[13px] leading-4 font-semibold text-foreground-secondary">
              {g.label}
            </h4>
            <ul>
              {g.items.map((m) => (
                <li key={m.key} className="border-b border-border">
                  <button
                    id={`dashboard-add-${m.key}`}
                    type="button"
                    onClick={() => add(m.key)}
                    aria-label={`Add ${m.label}${noData.has(m.key) ? ", no data yet" : ""}`}
                    className="-mx-2 flex min-h-14 w-[calc(100%+16px)] items-center gap-3 rounded-lg px-2 text-left transition-[background-color] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent"
                  >
                    <span aria-hidden className={ICON}>
                      {STAT_ICON[m.key]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-[22px] text-balance">{m.label}</span>
                      {noData.has(m.key) && <span className="block text-xs leading-4 font-medium text-muted-foreground">No data yet</span>}
                    </span>
                    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background">
                      <Plus className="size-3.5" strokeWidth={2.5} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="py-6 text-center text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            {hidden.length ? `No metric matches “${query.trim()}”.` : "Every metric is on Home."}
          </p>
        )}
        <p role="status" className="sr-only">
          {status}
        </p>
      </ResponsiveSheet>
    </>
  )
}
