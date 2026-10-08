"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Pencil, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { behavior, followUpText, JOURNAL_SECTIONS, questionOf } from "@/lib/behaviors"
import { DAY, dayLabel, formatDay } from "@/lib/format"
import { haptic } from "@/lib/haptics"
import { enqueue } from "@/lib/offline-queue"
import { addDays, parseDay } from "@/lib/url"
import { addCustomTag, loadCheckIn, saveJournalEntry, saveJournalNote } from "@/server/actions/journal"
import type { JournalVM } from "@/server/queries/types"
import { DayStrip } from "@/components/metrics/DayStrip"
import { StatusChip } from "@/components/metrics/primitives"
import { ResponsiveSheet, SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { SectionShell } from "@/components/shells/SectionShell"
import { closeSheet, openSheet } from "@/components/shells/SheetTrigger"
import { useShellCalendar, useShellStatus } from "@/components/shells/ShellStatus"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SelectBehaviorsSheet } from "../more/behaviours/SelectBehaviors"

/** journal-01's answer keys: a grey square each; "no" lights white, "yes" blue. 44 px for touch. */
const ANSWER =
  "size-11 rounded-[10px] bg-foreground/10 text-foreground/80 transition-[background-color,color,scale] duration-150 ease-standard hover:bg-foreground/15 active:scale-[0.96] [&_svg]:size-[18px]"
export const TAG_CLASS = "h-7 rounded-full px-3 text-[13px] font-semibold"

type Values = Record<string, number | undefined>
type Answer = { tag: string; value: boolean | null; detail: number | null }

/**
 * The answers Save writes: each tag whose answer or follow-up differs from the saved one, as yes/no, or null where
 * a saved answer was cleared (the server deletes it, so it reads as "not answered", not "no").
 */
export function changedEntries(values: Values, details: Values, saved: Record<string, number>, savedDetails: Record<string, number>): Answer[] {
  const tags = new Set([...Object.keys(values), ...Object.keys(details)])
  return [...tags]
    .filter((t) => values[t] !== saved[t] || (values[t] && details[t] !== savedDetails[t]))
    .map((t) => ({ tag: t, value: values[t] === undefined ? null : values[t]! > 0, detail: values[t] ? (details[t] ?? null) : null }))
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

type Loaded = { day: string } & Pick<JournalVM, "tags" | "checkIn" | "strip">

/** "Don't show me this message again" on Dismiss journal?, kept on this device. */
const QUIET_KEY = "pulse:journal-dismiss-quiet"
const quietDismiss = () => {
  try {
    return localStorage.getItem(QUIET_KEY) === "1"
  } catch {
    return false
  }
}

const heading = (day: string, today: string) =>
  day === today
    ? `What’s happening today, ${formatDay(day, { month: "long", day: "numeric" })}?`
    : `What happened on ${formatDay(day, { weekday: "long", month: "long", day: "numeric" })}?`

/**
 * The Journal (spec §7.11, journal-01..15), mounted once in the app layout: `?checkin=1` opens it full screen over
 * whatever screen is showing, for that screen's day (`?d=`); the strip and arrows inside move between days. Closing it
 * (X, Back, Save) leaves that screen as it was (spec §11 UX2).
 */
export function CheckInSheet() {
  const { today } = useShellCalendar()
  const { userId } = useShellStatus()
  const params = useSearchParams()
  const wants = params.get("checkin") === "1"
  const { d: urlDay } = parseDay(params.get("d") ?? undefined, today)
  const [open, setOpen] = React.useState(false)
  const [day, setDay] = React.useState(urlDay)
  const [data, setData] = React.useState<Loaded | null>(null)
  // keep: reload the questions only (after Select Behaviors), leaving the answers being entered alone.
  const [request, setRequest] = React.useState<{ day: string; n: number; keep?: boolean } | null>(null)
  const [picking, setPicking] = React.useState(false)
  const [loadError, setLoadError] = React.useState(false)
  const [values, setValues] = React.useState<Values>({})
  const [details, setDetails] = React.useState<Values>({})
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState(false)
  const [done, setDone] = React.useState(false)
  // The Dismiss journal? dialog: open, and the day to go to once dismissed (null: close the journal).
  const [confirm, setConfirm] = React.useState<{ to: string | null } | null>(null)
  const [quiet, setQuiet] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [addError, setAddError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  // Opened from a link, focus goes back to a visible check-in button on close (U18 O-02).
  const fallback = React.useRef<HTMLElement | null>(null)

  const loaded = data?.day === day ? data : null
  const tags = loaded?.tags ?? []
  const saved = loaded?.checkIn.entries ?? {}
  const savedDetails = loaded?.checkIn.details ?? {}
  const dirty = !!loaded && (changedEntries(values, details, saved, savedDetails).length > 0 || note.trim() !== loaded.checkIn.note)

  // A reload or leaving the page with unsaved answers asks the browser's way.
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
        if (request.keep) return
        setValues({ ...r.data.checkIn.entries })
        setDetails({ ...r.data.checkIn.details })
        setNote(r.data.checkIn.note)
      })
      .catch(() => live && setLoadError(true))
    return () => {
      live = false
    }
  }, [request])

  const load = (to: string) => {
    setDay(to)
    setLoadError(false)
    setSaveError(false)
    setRequest((r) => ({ day: to, n: (r?.n ?? 0) + 1 }))
  }

  // The URL drives the journal. Back with unsaved answers asks first; "No, complete journal" pushes the entry again.
  const [seen, setSeen] = React.useState(false)
  if (wants !== seen) {
    setSeen(wants)
    if (wants && !open) {
      setData(null)
      setValues({})
      setDetails({})
      setNote("")
      setDone(false)
      setAddError(null)
      setLabel("")
      setOpen(true)
      load(urlDay)
    } else if (!wants && open && !confirm) {
      if (dirty && !saving && !done) setConfirm({ to: null })
      else setOpen(false)
    }
  }

  React.useEffect(() => {
    if (!open) return
    fallback.current = Array.from(document.querySelectorAll<HTMLElement>("[data-sheet=checkin]")).find((e) => e.checkVisibility()) ?? null
  }, [open])

  const finish = () => {
    setConfirm(null)
    setOpen(false)
    closeSheet("checkin")
  }
  const keepEditing = () => {
    setConfirm(null)
    if (!new URLSearchParams(window.location.search).has("checkin")) openSheet("checkin")
  }
  const dismiss = () => {
    if (quiet)
      try {
        localStorage.setItem(QUIET_KEY, "1")
      } catch {}
    const to = confirm?.to
    if (to) {
      setConfirm(null)
      load(to)
    } else finish()
  }
  // The reference app asks on every X (journal-15) until "Don't show me this message again"; a day switch asks only
  // when it would drop answers.
  const close = (next: boolean) => {
    if (next || saving) return
    if (done || quietDismiss()) return finish()
    setQuiet(false)
    setConfirm({ to: null })
  }
  const go = (to: string) => {
    if (to === day || to > today) return
    if (dirty) {
      setQuiet(false)
      setConfirm({ to })
    } else load(to)
  }

  // An invalid name keeps focus on the field, so the error under it is read out and fixable in place.
  const invalid = (message: string) => {
    setAddError(message)
    input.current?.focus()
  }

  const save = async () => {
    if (!loaded) return
    setSaving(true)
    setSaveError(false)
    const changes = changedEntries(values, details, saved, savedDetails)
    const text = note.trim()
    let sent = 0
    try {
      if (!navigator.onLine) throw new Error("offline")
      for (; sent < changes.length; sent++) {
        const r = await saveJournalEntry({ day: loaded.day, ...changes[sent] })
        if (!r.ok) return setSaveError(true)
      }
      if (text !== loaded.checkIn.note) {
        const r = await saveJournalNote({ day: loaded.day, text })
        if (!r.ok) return setSaveError(true)
      }
      haptic()
      setDone(true)
    } catch {
      // A Server Action throws only when it can't reach the server: keep what wasn't sent on this device and send it
      // when the connection is back (PwaRuntime flushes the queue). A note waits for the connection.
      if (userId !== undefined) enqueue(userId, changes.slice(sent).map((c) => ({ day: loaded.day, ...c })))
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
    // A new behaviour starts as "Yes": you add one because you just did it. It joins the list until the next load.
    setData((d) => d && { ...d, tags: [...d.tags, { tag: r.data.tag, label: name, question: questionOf(r.data.tag, name), section: "custom", isDefault: false, hidden: false }] })
    setValues((v) => ({ ...v, [r.data.tag]: 1 }))
  }

  const prev = addDays(day, -1)
  const next = addDays(day, 1)

  return (
    <>
      <ResponsiveSheet
        open={open}
        onOpenChange={close}
        title="Journal"
        size="screen"
        glow
        fallbackFocus={fallback}
        action={
          <Button variant="ghost" size="icon-touch" aria-label="Select behaviours" aria-haspopup="dialog" onClick={() => setPicking(true)} className="text-foreground hover:bg-foreground/8">
            <Pencil aria-hidden strokeWidth={1.75} className="size-[22px]" />
          </Button>
        }
        done={done ? { title: "Saved", body: "Have a great day!", onDone: finish } : null}
        footer={
          <>
            {saveError && (
              <Alert role="alert" className="border-0 bg-recovery-red/15 px-3 py-2">
                <AlertDescription className="text-recovery-red-text">Couldn’t save. Check your connection and try again.</AlertDescription>
              </Alert>
            )}
            <Button size="sheet" onClick={save} disabled={saving || !loaded} aria-live="polite">
              {saving ? "Saving…" : "Save journal"}
            </Button>
          </>
        }
      >
        {/* ‹ TODAY ›: a day back or forward; never past today (journal-01). */}
        <nav aria-label="Journal day" className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="icon-touch" aria-label={`Previous day, ${formatDay(prev, DAY.long)}`} onClick={() => go(prev)}>
            <ChevronLeft aria-hidden strokeWidth={2} className="size-5" />
          </Button>
          <span className="min-w-28 text-center text-xs leading-4 font-bold tracking-[0.1em] uppercase">{dayLabel(day, today)}</span>
          <Button variant="ghost" size="icon-touch" aria-label={`Next day, ${formatDay(next, DAY.long)}`} disabled={next > today} onClick={() => go(next)}>
            <ChevronRight aria-hidden strokeWidth={2} className="size-5" />
          </Button>
        </nav>
        {data && (
          <div className="-mx-4 mt-2 md:-mx-6">
            <DayStrip indicator="journal" variant="pill" value={day} onSelect={go} days={data.strip.map((s) => ({ date: s.day, done: s.done }))} />
          </div>
        )}
        <h3 className="mt-6 max-w-[16ch] text-[30px] leading-9 font-semibold tracking-[-0.01em] text-balance">{heading(day, today)}</h3>

        {!loaded &&
          (loadError ? (
            <Alert role="alert" className="mt-6 border-0 bg-recovery-red/15 px-3 py-2">
              <AlertDescription className="flex items-center justify-between gap-3 text-recovery-red-text">
                Couldn’t load your journal.
                <Button variant="secondary" size="touch" onClick={() => load(day)}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div role="status" aria-label="Loading" className="grid place-items-center py-16">
              <LoaderCircle aria-hidden className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" strokeWidth={2} />
            </div>
          ))}
        {loaded &&
          JOURNAL_SECTIONS.map((g) => {
            const items = tags.filter((t) => t.section === g.key)
            if (!items.length && g.key !== "custom") return null
            return (
              <section key={g.key} aria-labelledby={`journal-${g.key}`} className="mt-7">
                <h4 id={`journal-${g.key}`} className={SHEET_SECTION}>
                  {g.title}
                </h4>
                <ul className="mt-3 space-y-3">
                  {items.map((t) => {
                    const v = values[t.tag]
                    const f = behavior(t.tag)?.followUp
                    const d = details[t.tag]
                    return (
                      <li key={t.tag} className="rounded-2xl bg-foreground/[0.07] px-4">
                        <div className="flex min-h-18 items-center gap-3 py-3">
                          <span className="min-w-0 flex-1 text-[17px] leading-6 text-pretty">{t.question}</span>
                          <ToggleGroup
                            type="single"
                            spacing={2}
                            aria-label={t.question}
                            value={v === undefined ? "" : v > 0 ? "yes" : "no"}
                            onValueChange={(x) => setValues((s) => ({ ...s, [t.tag]: x === "yes" ? 1 : x === "no" ? 0 : undefined }))}
                          >
                            <ToggleGroupItem value="no" aria-label="No" className={cn(ANSWER, "data-[state=on]:bg-foreground data-[state=on]:text-background")}>
                              <X aria-hidden strokeWidth={3} />
                            </ToggleGroupItem>
                            <ToggleGroupItem value="yes" aria-label="Yes" className={cn(ANSWER, "data-[state=on]:bg-answer-yes data-[state=on]:text-on-color")}>
                              <Check aria-hidden strokeWidth={3} />
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </div>
                        {/* journal-12: a "yes" opens its follow-up; "--" until the slider moves. */}
                        {f && v !== undefined && v > 0 && (
                          <div className="border-t border-border pt-3 pb-1">
                            <div className="flex items-baseline justify-between gap-3 px-2">
                              <span id={`follow-${t.tag}`} className="text-[15px] leading-[22px] text-foreground-secondary">
                                {f.question}
                              </span>
                              <span className="font-numeric text-[15px] leading-[22px] font-semibold tabular-nums">{d === undefined ? "--" : followUpText(f, d)}</span>
                            </div>
                            <Slider
                              aria-label={f.question}
                              aria-valuetext={d === undefined ? "Not set" : followUpText(f, d)}
                              min={f.min}
                              max={f.max}
                              step={f.step}
                              value={[d ?? f.min]}
                              onValueChange={([x]) => setDetails((s) => ({ ...s, [t.tag]: x }))}
                              className="px-2"
                            />
                          </div>
                        )}
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
        {loaded && (
          <section aria-labelledby="journal-notes" className="mt-7">
            <h4 id="journal-notes" className={SHEET_SECTION}>
              <label htmlFor="journal-note">Notes</label>
            </h4>
            <textarea
              id="journal-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
              maxLength={2000}
              className="mt-3 field-sizing-content min-h-14 w-full resize-none rounded-2xl border border-border bg-transparent px-4 py-3.5 text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </section>
        )}
      </ResponsiveSheet>

      <SelectBehaviorsSheet open={picking} onOpenChange={setPicking} onSaved={() => setRequest((r) => ({ day, n: (r?.n ?? 0) + 1, keep: true }))} />

      {/* journal-15. */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && keepEditing()}>
        <DialogContent className="gap-5 bg-linear-to-b from-popover-top to-popover p-6 ring-1 ring-border sm:max-w-sm">
          <DialogHeader className="items-center pt-4 text-center">
            <DialogTitle className="text-[15px] leading-5 font-bold tracking-[0.1em] uppercase">Dismiss journal?</DialogTitle>
            <DialogDescription className="text-[15px] leading-[22px] text-pretty text-foreground-secondary">
              Choosing “Yes” discards what you’ve entered. You can come back and complete this journal later.
            </DialogDescription>
          </DialogHeader>
          <Label className="flex min-h-11 items-center gap-3 text-xs leading-4 font-bold tracking-[0.1em] uppercase">
            <Checkbox checked={quiet} onCheckedChange={(c) => setQuiet(c === true)} className="size-7 rounded-md" />
            Don’t show me this message again
          </Label>
          <div className="flex flex-col gap-3">
            <Button size="sheet" onClick={keepEditing}>
              No, complete journal
            </Button>
            <Button size="sheet" variant="outline-pill" onClick={dismiss}>
              Yes, dismiss journal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
