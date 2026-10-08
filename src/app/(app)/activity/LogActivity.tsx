"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Heart, Info, Search, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { Dialog as DialogPrimitive } from "radix-ui"
import { ACTIVITY_CATEGORIES, ACTIVITY_TYPES, activityType, type ActivityCategory } from "@/lib/activityTypes"
import { FEATURES } from "@/lib/features"
import { formatValue, MISSING } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ActivityKind } from "@/server/queries/types"
import { ACTIVITY_ICON } from "@/components/metrics/ActivityCard"
import { ResponsiveSheet, SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { closeSheet } from "@/components/shells/SheetTrigger"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/** The catalogue type a recent workout kind stands for, for Select Activity's "Most recent". */
const RECENT_TYPE: Partial<Record<ActivityKind, string>> = { walk: "walking", run: "running", strength: "weightlifting", ride: "cycling" }

type Tab = "all" | ActivityCategory

/**
 * Select Activity (activity-07, activity-09): search, All / Strain / Recovery / Sleep, then "Most recent" (the kinds of
 * the last 30 days' workouts) over "All A-Z", each a card with the activity's icon and its name in caps.
 */
export function SelectActivity({ recent, onSelect }: { recent: ActivityKind[]; onSelect: (key: string) => void }) {
  const [query, setQuery] = React.useState("")
  const [tab, setTab] = React.useState<Tab>("all")
  const q = query.trim().toLowerCase()
  const fits = (key: string) => {
    const a = activityType(key)!
    return (tab === "all" || a.category === tab) && (!q || a.label.toLowerCase().includes(q))
  }
  const sections = [
    { key: "recent", title: "Most recent", keys: recent.flatMap((k) => RECENT_TYPE[k] ?? []).filter(fits) },
    { key: "az", title: "All A-Z", keys: ACTIVITY_TYPES.map((a) => a.key).filter(fits) },
  ]
  return (
    <div>
      <div className="relative">
        <Search aria-hidden strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for activities"
          aria-label="Search for activities"
          autoComplete="off"
          className="h-12 rounded-xl bg-foreground/[0.06] pl-11 text-base"
        />
      </div>
      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as Tab)} aria-label="Category" spacing={0} className="mt-3 gap-1">
        {[{ key: "all", label: "All" }, ...ACTIVITY_CATEGORIES].map((c) => (
          <ToggleGroupItem
            key={c.key}
            value={c.key}
            className="relative h-11 rounded-none! bg-transparent! px-2.5 text-xs leading-4 font-bold tracking-[0.1em] text-muted-foreground uppercase after:absolute after:inset-x-2.5 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity data-[state=on]:text-foreground data-[state=on]:after:opacity-100"
          >
            {c.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {sections.map(
        (s) =>
          s.keys.length > 0 && (
            <section key={s.key} aria-labelledby={`activities-${s.key}`} className="mt-4">
              <h3 id={`activities-${s.key}`} className={SHEET_SECTION}>
                {s.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {s.keys.map((key) => {
                  const a = activityType(key)!
                  const Icon = ACTIVITY_ICON[a.kind]
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => onSelect(key)}
                        className="flex h-14 w-full items-center gap-4 rounded-xl bg-foreground/[0.07] px-4 text-left text-[13px] leading-4 font-bold tracking-[0.1em] uppercase outline-none transition-[background-color,scale] duration-150 ease-standard hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
                      >
                        <Icon aria-hidden strokeWidth={1.75} className="size-6 text-muted-foreground" />
                        {a.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
      )}
      {sections.every((s) => !s.keys.length) && <p className="py-8 text-center text-[15px] leading-[22px] text-foreground-secondary">No activities match “{query.trim()}”.</p>}
    </div>
  )
}

/** A local date-time for `<input type="datetime-local">`: "2026-10-08T14:42". */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

/**
 * Add Activity (activity-06): the activity, its start and end, and Save once the times make sense. Pulse can't write a
 * workout to Google Health, so it stays off (FEATURES.logActivity) and `onSave` has no caller yet; the wear-location
 * question has no Fitbit counterpart and is left out.
 */
function AddActivitySheet({ open, onOpenChange, recent, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; recent: ActivityKind[]; onSave?: (a: { type: string; start: Date; end: Date }) => Promise<void> }) {
  const [type, setType] = React.useState<string | null>(null)
  const [picking, setPicking] = React.useState(false)
  const [start, setStart] = React.useState(() => localInput(new Date(Date.now() - 3_600_000)))
  const [end, setEnd] = React.useState(() => localInput(new Date()))
  const [saving, setSaving] = React.useState(false)
  const a = type ? activityType(type) : undefined
  const Icon = a ? ACTIVITY_ICON[a.kind] : ACTIVITY_ICON.workout
  const valid = !!a && end > start && new Date(end) <= new Date()
  const save = async () => {
    if (!onSave || !a) return
    setSaving(true)
    await onSave({ type: a.key, start: new Date(start), end: new Date(end) })
    setSaving(false)
    onOpenChange(false)
  }
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={picking ? "Select activity" : "Add activity"}
      size="screen"
      footer={
        !picking && (
          <Button size="sheet" onClick={save} disabled={!valid || !onSave || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )
      }
    >
      {picking ? (
        <>
          <Button variant="ghost" size="touch" onClick={() => setPicking(false)} className="-ml-2 mb-2 gap-1 px-2 text-muted-foreground">
            <ChevronLeft aria-hidden strokeWidth={2} className="size-5" />
            Back
          </Button>
          <SelectActivity
            recent={recent}
            onSelect={(k) => {
              setType(k)
              setPicking(false)
            }}
          />
        </>
      ) : (
        <div className="space-y-7">
          <p className="flex gap-3 rounded-xl bg-strain/15 px-4 py-3 text-[15px] leading-[22px] text-pretty text-strain-text">
            <Info aria-hidden strokeWidth={1.75} className="mt-0.5 size-5 shrink-0" />
            Your band’s heart rate over this time gives the activity its Strain.
          </p>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex h-16 w-full items-center gap-4 rounded-xl bg-foreground/[0.07] px-4 text-left text-[13px] leading-4 font-bold tracking-[0.1em] uppercase outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Icon aria-hidden strokeWidth={1.75} className="size-7 text-muted-foreground" />
            <span className="flex-1">{a?.label ?? "Select activity"}</span>
            <ChevronRight aria-hidden strokeWidth={2} className="size-5" />
          </button>
          <section aria-labelledby="add-activity-time" className="space-y-2">
            <h3 id="add-activity-time" className={SHEET_SECTION}>
              Time
            </h3>
            {[
              { id: "activity-start", label: "Start time", value: start, set: setStart },
              { id: "activity-end", label: "End time", value: end, set: setEnd },
            ].map((f) => (
              <div key={f.id} className="flex min-h-14 items-center justify-between gap-3 px-1">
                <Label htmlFor={f.id} className="text-[17px] leading-6 font-normal">
                  {f.label}
                </Label>
                <input
                  id={f.id}
                  type="datetime-local"
                  value={f.value}
                  max={localInput(new Date())}
                  onChange={(e) => f.set(e.target.value)}
                  className="h-11 rounded-lg bg-foreground/[0.07] px-3 font-numeric text-[15px] font-semibold text-foreground tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
            ))}
            {end <= start && (
              <p role="alert" className="px-1 text-xs leading-4 font-medium text-recovery-red-text">
                End after the start.
              </p>
            )}
          </section>
        </div>
      )}
    </ResponsiveSheet>
  )
}

/**
 * Start Activity (activity-08): the activity with a picker, Track route, the live heart rate in a large strain-blue
 * circle, today's Strain Target with its toggle, and Start activity. Pulse has no live heart rate or location while
 * recording, so it stays off (FEATURES.startActivity), the heart rate reads "--" and `onStart` has no caller yet.
 */
function StartActivitySheet({
  open,
  onOpenChange,
  recent,
  strainTarget,
  onStart,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  recent: ActivityKind[]
  strainTarget: [number, number] | null
  onStart?: (a: { type: string; trackRoute: boolean; target: boolean }) => void
}) {
  const [type, setType] = React.useState(() => RECENT_TYPE[recent[0]] ?? "walking")
  const [picking, setPicking] = React.useState(false)
  const [route, setRoute] = React.useState(true)
  const [target, setTarget] = React.useState(true)
  const a = activityType(type)!
  const Icon = ACTIVITY_ICON[a.kind]
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Focus the screen itself, not a ring on the X (as the full-screen sheets do).
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).focus()
          }}
          className="fixed inset-0 z-50 flex flex-col bg-[radial-gradient(circle_at_50%_40%,var(--strain-deep),var(--background)_70%)] pt-[env(safe-area-inset-top)] text-foreground outline-none"
        >
          <div className="flex items-center gap-2 bg-background/80 px-2 py-2">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-touch" aria-label="Close">
                <X aria-hidden strokeWidth={1.75} className="size-[22px]" />
              </Button>
            </DialogPrimitive.Close>
            <DialogPrimitive.Title asChild>
              <button
                type="button"
                aria-expanded={picking}
                onClick={() => setPicking((p) => !p)}
                className="flex h-11 flex-1 items-center gap-3 rounded-lg px-2 text-[15px] leading-5 font-bold tracking-[0.1em] uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-6" />
                <span className="flex-1 text-left">{a.label}</span>
                <ChevronDown aria-hidden strokeWidth={2} className={cn("size-5 transition-[rotate] duration-200 ease-standard", picking && "rotate-180")} />
              </button>
            </DialogPrimitive.Title>
          </div>
          {picking ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-background/95 px-4 py-4">
              <SelectActivity
                recent={recent}
                onSelect={(k) => {
                  setType(k)
                  setPicking(false)
                }}
              />
            </div>
          ) : (
            <>
              <div className="flex justify-end px-4 pt-3">
                <Label className="gap-3 text-xs leading-4 font-bold tracking-[0.1em] uppercase">
                  Track route
                  <Switch checked={route} onCheckedChange={setRoute} />
                </Label>
              </div>
              <div className="grid flex-1 place-items-center">
                <div role="img" aria-label="Live heart rate not available" className="grid size-62 place-items-center rounded-full bg-strain text-center text-on-strain">
                  <div>
                    <Heart aria-hidden fill="currentColor" strokeWidth={0} className="mx-auto size-9" />
                    <p className="font-numeric text-[88px] leading-none font-bold">{MISSING}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-t-[28px] bg-sheet px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-sheet">
                <div className="flex min-h-14 items-center gap-4">
                  <span className="font-numeric text-xl leading-7 font-bold tabular-nums">
                    {strainTarget ? `${formatValue("decimal1", strainTarget[0])}–${formatValue("decimal1", strainTarget[1])}` : MISSING}
                  </span>
                  <Label htmlFor="start-target" className="flex-1 text-xs leading-4 font-bold tracking-[0.1em] uppercase">
                    Strain target
                  </Label>
                  <Switch id="start-target" checked={target} onCheckedChange={setTarget} disabled={!strainTarget} />
                </div>
                <Button size="sheet" className="mt-3 w-full" disabled={!onStart} onClick={() => onStart?.({ type, trackRoute: route, target })}>
                  Start activity
                </Button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * The hidden activity flows, mounted once in the app layout when their flags are on: `?add-activity=1` opens Add
 * Activity and `?start-activity=1` Start Activity over the current screen.
 */
export function ActivitySheets({ recent, strainTarget }: { recent: ActivityKind[]; strainTarget: [number, number] | null }) {
  const params = useSearchParams()
  return (
    <>
      {FEATURES.logActivity && <AddActivitySheet open={params.has("add-activity")} onOpenChange={(o) => !o && closeSheet("add-activity")} recent={recent} />}
      {FEATURES.startActivity && (
        <StartActivitySheet open={params.has("start-activity")} onOpenChange={(o) => !o && closeSheet("start-activity")} recent={recent} strainTarget={strainTarget} />
      )}
    </>
  )
}
