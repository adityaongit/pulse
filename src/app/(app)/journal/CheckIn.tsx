"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { JOURNAL_SECTIONS } from "@/lib/behaviors"
import { tagIcon } from "@/lib/journal"
import { DAY, formatDay } from "@/lib/format"
import { haptic } from "@/lib/haptics"
import { enqueue } from "@/lib/offline-queue"
import { parseDay } from "@/lib/url"
import { addCustomTag, loadCheckIn, saveJournalEntry } from "@/server/actions/journal"
import type { JournalVM } from "@/server/queries/types"
import { StatusChip } from "@/components/metrics/primitives"
import { ResponsiveSheet, SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { SectionShell } from "@/components/shells/SectionShell"
import { closeSheet, openSheet } from "@/components/shells/SheetTrigger"
import { useShellCalendar, useShellStatus } from "@/components/shells/ShellStatus"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const ITEM =
  "h-11 min-w-14 rounded-lg px-3 text-[13px] font-bold tracking-[0.1em] uppercase transition-[background-color,color] duration-150 ease-standard"
export const TAG_CLASS = "h-7 rounded-full px-3 text-[13px] font-semibold"

type Values = Record<string, number | undefined>

/**
 * The answers Save writes: each tag whose value differs from the saved one, as yes/no, or null where a
 * saved answer was cleared (the server deletes it, so it reads as "not answered", not "no").
 */
export function changedEntries(values: Values, saved: Record<string, number>): [string, boolean | null][] {
  return Object.entries(values)
    .filter(([t, v]) => v !== saved[t])
    .map(([t, v]) => [t, v === undefined ? null : v > 0])
}

export type CheckInProps = {
  /** "Mon, Sep 28". */
  dayLabel: string
  checkIn: JournalVM["checkIn"]
}

/** The Journal's check-in card (spec §7.11, journey 7). Its button opens the app-wide `CheckInSheet`. */
export function CheckIn({ dayLabel, checkIn }: CheckInProps) {
  const start = () => openSheet("checkin")
  // The section above is headed "Check-in", so the card is titled by its day, as History's rows are (SYM2).
  return (
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
          <Button aria-haspopup="dialog" data-sheet="checkin" variant="secondary" size="touch" className="mt-auto w-full" onClick={start}>
            Edit check-in
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            Log what you did today. Pulse compares it with tomorrow’s Recovery.
          </p>
          <Button aria-haspopup="dialog" data-sheet="checkin" size="touch" className="mt-auto w-full" onClick={start}>
            Check in
          </Button>
        </div>
      )}
    </SectionShell>
  )
}

type Loaded = { day: string } & Pick<JournalVM, "tags" | "checkIn">

/**
 * The check-in sheet (spec §7.11), mounted once in the app layout: `?checkin=1` opens it over whatever screen is
 * showing, for that screen's day (`?d=`), and closing it (X, swipe, Save, Back) leaves that screen as it was
 * (spec §11 UX2). The behaviours and answers load when it opens.
 */
export function CheckInSheet() {
  const { today } = useShellCalendar()
  const { userId } = useShellStatus()
  const params = useSearchParams()
  const wants = params.get("checkin") === "1"
  const { d: day } = parseDay(params.get("d") ?? undefined, today)
  const [open, setOpen] = React.useState(false)
  const [data, setData] = React.useState<Loaded | null>(null)
  const [request, setRequest] = React.useState<{ day: string; n: number } | null>(null)
  const [loadError, setLoadError] = React.useState(false)
  const [values, setValues] = React.useState<Values>({})
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState(false)
  const [confirm, setConfirm] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [addError, setAddError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  // Opened from a link, focus goes back to a visible check-in button on close (U18 O-02).
  const fallback = React.useRef<HTMLElement | null>(null)

  const tags = data?.tags ?? []
  const saved = data?.checkIn.entries ?? {}
  const dirty = Object.keys(values).some((t) => values[t] !== saved[t])
  const dayLabel = formatDay(data?.day ?? day, DAY.short)

  // Closing the sheet asks before discarding (Discard changes?); a reload or leaving the page asks the browser's way.
  React.useEffect(() => {
    if (!open || !dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [open, dirty])

  React.useEffect(() => {
    if (!request) return
    let live = true
    loadCheckIn(request.day)
      .then((r) => {
        if (!live) return
        if (!r.ok) return setLoadError(true)
        setData({ day: request.day, ...r.data })
        setValues({ ...r.data.checkIn.entries })
      })
      .catch(() => live && setLoadError(true))
    return () => {
      live = false
    }
  }, [request])

  // The URL drives the sheet. Back with unsaved answers asks first; "Keep editing" pushes the entry again.
  const [seen, setSeen] = React.useState(false)
  if (wants !== seen) {
    setSeen(wants)
    if (wants && !open) {
      setData(null)
      setValues({})
      setLoadError(false)
      setSaveError(false)
      setAddError(null)
      setLabel("")
      setOpen(true)
      setRequest((r) => ({ day, n: (r?.n ?? 0) + 1 }))
    } else if (!wants && open && !confirm) {
      if (dirty && !saving) setConfirm(true)
      else setOpen(false)
    }
  }

  React.useEffect(() => {
    if (!open) return
    fallback.current = Array.from(document.querySelectorAll<HTMLElement>("[data-sheet=checkin]")).find((e) => e.checkVisibility()) ?? null
  }, [open])

  const finish = () => {
    setConfirm(false)
    setOpen(false)
    closeSheet("checkin")
  }
  const retry = () => {
    setLoadError(false)
    setRequest((r) => r && { ...r, n: r.n + 1 })
  }
  const keepEditing = () => {
    setConfirm(false)
    if (!new URLSearchParams(window.location.search).has("checkin")) openSheet("checkin")
  }

  // An invalid name keeps focus on the field, so the error under it is read out and fixable in place.
  const invalid = (message: string) => {
    setAddError(message)
    input.current?.focus()
  }

  const close = (next: boolean) => {
    if (next) return
    if (dirty && !saving) return setConfirm(true)
    finish()
  }

  const save = async () => {
    if (!data) return
    setSaving(true)
    setSaveError(false)
    const changes = changedEntries(values, data.checkIn.entries)
    let sent = 0
    try {
      if (!navigator.onLine) throw new Error("offline")
      for (; sent < changes.length; sent++) {
        const [tag, value] = changes[sent]
        const r = await saveJournalEntry({ day: data.day, tag, value })
        if (!r.ok) return setSaveError(true)
      }
      haptic()
      finish()
      toast.success("Check-in saved")
    } catch {
      // A Server Action throws only when it can't reach the server: keep what wasn't sent on this device and send it
      // when the connection is back (PwaRuntime flushes the queue).
      if (userId !== undefined) enqueue(userId, changes.slice(sent).map(([tag, value]) => ({ day: data.day, tag, value })))
      finish()
      toast("Saved on this device", { description: "It sends when you’re back online." })
    } finally {
      setSaving(false)
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = label.trim()
    if (!name) return
    if (name.length > 32) return invalid("Use 32 characters or fewer.")
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
    if (tags.some((t) => t.tag === key || t.label.toLowerCase() === name.toLowerCase())) return invalid("That behaviour already exists.")
    setAdding(true)
    const r = await addCustomTag({ label: name }).catch(() => ({ ok: false as const, error: "network" }))
    setAdding(false)
    if (!r.ok) return invalid(r.error.startsWith("Tag already exists") ? "That behaviour already exists." : r.error.startsWith("Too many") ? "You’ve reached the behaviour limit." : "Couldn’t add it. Try again.")
    setAddError(null)
    setLabel("")
    // A new behaviour starts as "Yes": you add one because you just did it.
    setValues((v) => ({ ...v, [r.data.tag]: 1 }))
  }

  return (
    <>
      <ResponsiveSheet
        open={open}
        onOpenChange={close}
        title="Check in"
        description={dayLabel}
        size="tall"
        fallbackFocus={fallback}
        footer={
          <>
            {saveError && (
              <Alert role="alert" className="border-0 bg-recovery-red/15 px-3 py-2">
                <AlertDescription className="text-recovery-red-text">Couldn’t save. Check your connection and try again.</AlertDescription>
              </Alert>
            )}
            <Button size="sheet" onClick={save} disabled={saving || !data} aria-live="polite">
              {saving ? "Saving…" : "Save check-in"}
            </Button>
          </>
        }
      >
        {!data &&
          (loadError ? (
            <Alert role="alert" className="mt-2 border-0 bg-recovery-red/15 px-3 py-2">
              <AlertDescription className="flex items-center justify-between gap-3 text-recovery-red-text">
                Couldn’t load your check-in.
                <Button variant="secondary" size="touch" onClick={retry}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div role="status" aria-label="Loading" className="grid place-items-center py-16">
              <LoaderCircle aria-hidden className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" strokeWidth={2} />
            </div>
          ))}
        {data && JOURNAL_SECTIONS.map((g) => {
          const items = tags.filter((t) => t.section === g.key)
          if (!items.length && g.key !== "custom") return null
          return (
            <section key={g.key} aria-labelledby={`checkin-${g.key}`} className="mt-6 first:mt-2">
              <h3 id={`checkin-${g.key}`} className={SHEET_SECTION}>
                {g.title}
              </h3>
              <ul>
                {items.map((t) => {
                  const Icon = tagIcon(t.tag)
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
                          className={cn(ITEM, "data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background")}
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
            </section>
          )
        })}
      </ResponsiveSheet>

      <Dialog open={confirm} onOpenChange={(o) => !o && keepEditing()}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>Your check-in for {dayLabel} isn’t saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="touch" onClick={keepEditing}>
              Keep editing
            </Button>
            <Button
              variant="outline"
              size="touch"
              className="text-recovery-red-text"
              onClick={finish}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

