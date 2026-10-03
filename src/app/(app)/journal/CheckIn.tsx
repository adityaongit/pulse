"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Bath, Coffee, Flower2, Plane, Smartphone, StretchHorizontal, Tag, Thermometer, Utensils, Wine, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { withParam } from "@/lib/url"
import { addCustomTag, saveJournalEntry } from "@/server/actions/journal"
import type { JournalTag, JournalVM } from "@/server/queries/types"
import { StatusChip } from "@/components/metrics/primitives"
import { ResponsiveSheet, SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { SectionShell } from "@/components/shells/SectionShell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const ICON: Record<string, LucideIcon> = {
  alcohol: Wine,
  late_caffeine: Coffee,
  late_meal: Utensils,
  screen_in_bed: Smartphone,
  meditation: Flower2,
  stretching: StretchHorizontal,
  sauna: Bath,
  travel: Plane,
  illness: Thermometer,
}
const GROUPS: { key: JournalTag["group"]; title: string }[] = [
  { key: "evening", title: "Evening" },
  { key: "recovery", title: "Recovery" },
  { key: "context", title: "Context" },
  { key: "custom", title: "Your behaviours" },
]
const ITEM =
  "h-11 min-w-14 rounded-lg px-3 text-[13px] font-bold tracking-[0.06em] uppercase transition-[background-color,color] duration-150 ease-standard"
export const TAG_CLASS = "h-7 rounded-full px-3 text-[13px] font-semibold"

type Values = Record<string, number | undefined>

export type CheckInProps = {
  day: string
  /** "Mon, Sep 28". */
  dayLabel: string
  tags: JournalTag[]
  checkIn: JournalVM["checkIn"]
}

/** The check-in card and its sheet (spec §7.11, journey 7). `?checkin=1` opens the sheet on arrival. */
export function CheckIn({ day, dayLabel, tags, checkIn }: CheckInProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = React.useState(false)
  // The card's Edit / Check in button: focus returns here when the sheet opened from `?checkin=1` (U18 O-02).
  const trigger = React.useRef<HTMLButtonElement>(null)
  const [values, setValues] = React.useState<Values>({})
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState(false)
  const [confirm, setConfirm] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [addError, setAddError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  const dirty = Object.keys(values).some((t) => values[t] !== checkIn.entries[t])

  const start = () => {
    setValues({ ...checkIn.entries })
    setSaveError(false)
    setAddError(null)
    setLabel("")
    setOpen(true)
  }

  // `?checkin=1` (Journal Insights' empty state, the history empty state) opens the sheet once.
  const wantsOpen = params.get("checkin") === "1"
  const [handled, setHandled] = React.useState(false)
  if (wantsOpen !== handled) {
    setHandled(wantsOpen)
    if (wantsOpen) start()
  }
  React.useEffect(() => {
    if (wantsOpen) router.replace(`${pathname}${withParam(params.toString(), "checkin", null)}`, { scroll: false })
  }, [wantsOpen, router, pathname, params])

  const close = (next: boolean) => {
    if (next) return setOpen(true)
    if (dirty && !saving) return setConfirm(true)
    setOpen(false)
  }

  const save = async () => {
    setSaving(true)
    setSaveError(false)
    const changed = Object.entries(values).filter(([t, v]) => v !== undefined && v !== checkIn.entries[t])
    try {
      for (const [tag, value] of changed) {
        const r = await saveJournalEntry({ day, tag, value: value! > 0 })
        if (!r.ok) throw new Error(r.error)
      }
      setOpen(false)
      toast.success("Check-in saved")
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = label.trim()
    if (!name) return
    if (name.length > 32) return setAddError("Use 32 characters or fewer.")
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
    if (tags.some((t) => t.tag === key || t.label.toLowerCase() === name.toLowerCase())) return setAddError("That behaviour already exists.")
    setAdding(true)
    const r = await addCustomTag({ label: name }).catch(() => ({ ok: false as const, error: "network" }))
    setAdding(false)
    if (!r.ok) return setAddError(r.error.startsWith("Tag already exists") ? "That behaviour already exists." : "Couldn't add it. Try again.")
    setAddError(null)
    setLabel("")
    // A new behaviour starts as "Yes": you add one because you just did it.
    setValues((v) => ({ ...v, [r.data.tag]: 1 }))
  }

  return (
    <>
      {/* The section above is headed "Check-in", so the card is titled by its day, as History's rows are (SYM2). */}
      <SectionShell variant="card" title={dayLabel} fill>
        {checkIn.done ? (
          <div className="flex flex-1 flex-col gap-4">
            {/* Status and the day's behaviours on one wrapping line. */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="optimal">Checked in</StatusChip>
              {checkIn.yes.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Behaviours logged">
                  {checkIn.yes.map((y) => (
                    <li key={y.tag}>
                      <Badge variant="secondary" className={TAG_CLASS}>
                        {y.label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Full width at the card's foot, as Check in and Home's card buttons are (SYM3). */}
            <Button ref={trigger} variant="secondary" size="touch" className="mt-auto w-full" onClick={start}>
              Edit check-in
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
              Log what you did today. Pulse compares it with tomorrow&apos;s Recovery.
            </p>
            <Button ref={trigger} size="touch" className="mt-auto w-full" onClick={start}>
              Check in
            </Button>
          </div>
        )}
      </SectionShell>

      <ResponsiveSheet
        open={open}
        onOpenChange={close}
        title="Check in"
        description={dayLabel}
        size="tall"
        fallbackFocus={trigger}
        footer={
          <>
            {saveError && (
              <Alert role="alert" className="border-0 bg-recovery-red/15 px-3 py-2">
                <AlertDescription className="text-recovery-red-text">Couldn&apos;t save. Check your connection and try again.</AlertDescription>
              </Alert>
            )}
            <Button size="sheet" onClick={save} disabled={saving} aria-live="polite">
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {GROUPS.map((g) => {
          const items = tags.filter((t) => t.group === g.key)
          if (!items.length && g.key !== "custom") return null
          return (
            <section key={g.key} aria-labelledby={`checkin-${g.key}`} className="mt-6 first:mt-2">
              <h3 id={`checkin-${g.key}`} className={SHEET_SECTION}>
                {g.title}
              </h3>
              <ul>
                {items.map((t) => {
                  const Icon = ICON[t.tag] ?? Tag
                  const v = values[t.tag]
                  return (
                    <li key={t.tag} className="flex min-h-14 items-center gap-3 border-b border-border">
                      <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-[15px] leading-[22px]">{t.label}</span>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        spacing={1}
                        aria-label={t.label}
                        value={v === undefined ? "" : v > 0 ? "yes" : "no"}
                        onValueChange={(x) => setValues((s) => ({ ...s, [t.tag]: x === "yes" ? 1 : x === "no" ? 0 : undefined }))}
                      >
                        <ToggleGroupItem value="no" className={cn(ITEM, "data-[state=on]:border-foreground/50 data-[state=on]:bg-foreground/15 data-[state=on]:text-foreground")}>
                          No
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="yes"
                          className={cn(ITEM, "data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-primary-foreground")}
                        >
                          Yes
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </li>
                  )
                })}
              </ul>
              {g.key === "custom" && (
                <form onSubmit={add} className="mt-4 space-y-2" noValidate>
                  <Label htmlFor="new-behaviour" className="text-[15px] leading-[22px] font-medium">
                    Add a behaviour
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="new-behaviour"
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
                    <Button type="submit" variant="secondary" size="touch" disabled={adding || !label.trim()}>
                      Add
                    </Button>
                  </div>
                  {addError && (
                    <p id="new-behaviour-error" role="alert" className="text-xs leading-4 font-medium text-recovery-red-text">
                      {addError}
                    </p>
                  )}
                </form>
              )}
            </section>
          )
        })}
      </ResponsiveSheet>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>Your check-in for {dayLabel} isn&apos;t saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="touch" onClick={() => setConfirm(false)}>
              Keep editing
            </Button>
            <Button
              variant="outline"
              size="touch"
              className="text-recovery-red-text"
              onClick={() => {
                setConfirm(false)
                setOpen(false)
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

