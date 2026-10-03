"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { saveProfileAction, type ProfileFormState } from "@/server/actions/profile"
import { Button } from "@/components/ui/button"
import { BirthDatePicker } from "./BirthDatePicker"

export type ProfileDefaults = { birthDate: string; sex: "male" | "female" | null; maxHr: number | null; heightCm: number | null }

const FIELD =
  "h-13 w-full min-w-0 rounded-xl bg-field px-4 text-[17px] leading-6 text-foreground tabular-nums outline-none transition-[box-shadow] duration-150 ease-standard placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground/70 aria-invalid:ring-2 aria-invalid:ring-recovery-red-text [color-scheme:dark]"
const LABEL = "text-xs leading-4 font-bold tracking-[0.08em] text-foreground-secondary uppercase"
const HINT = "text-[13px] leading-[18px] text-muted-foreground text-pretty"
const ERROR = "text-[13px] leading-[18px] font-medium text-recovery-red-text"

function Field({ id, label, hint, error, optional, children }: { id: string; label: string; hint: string; error?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
        {optional && <span className="ml-2 font-medium tracking-normal normal-case text-muted-foreground">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={ERROR}>
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * The profile fields (U19), shared by onboarding and Settings › Profile: a year-first birth date picker, and
 * the sex choice as a radio pair styled as a segmented control.
 * `footer` renders the submit, so each host places it (onboarding pins it to the bottom, the sheet to its foot).
 */
export function ProfileForm({
  defaults,
  onboarding = false,
  startYear,
  onSaved,
  footer,
}: {
  defaults: ProfileDefaults
  /** First run: only what nothing else can supply (birth date, sex). Height and max HR wait for Settings. */
  onboarding?: boolean
  /** The year the empty date picker opens on (from Google's age). */
  startYear?: number
  onSaved?: () => void
  footer: (pending: boolean) => React.ReactNode
}) {
  const [state, action, pending] = React.useActionState<ProfileFormState, FormData>(saveProfileAction, null)
  const f = state?.ok === false ? state.fields : undefined
  React.useEffect(() => {
    if (state?.ok) onSaved?.()
  }, [state, onSaved])
  const described = (id: keyof NonNullable<typeof f>) => ({ "aria-invalid": !!f?.[id] || undefined, "aria-describedby": `${id}-${f?.[id] ? "error" : "hint"}` })

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {onboarding && <input type="hidden" name="onboarding" value="1" />}
      <Field id="birthDate" label="Birth date" hint="Sets your age for heart rate zones, sleep need and Pulse Age." error={f?.birthDate}>
        <BirthDatePicker id="birthDate" name="birthDate" defaultValue={defaults.birthDate} startYear={startYear} invalid={!!f?.birthDate} describedBy={described("birthDate")["aria-describedby"]} />
      </Field>

      <fieldset className="flex flex-col gap-2" aria-describedby={f?.sex ? "sex-error" : "sex-hint"}>
        <legend className={cn(LABEL, "mb-2")}>Sex</legend>
        <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-field p-1">
          {(["male", "female"] as const).map((v) => (
            <label key={v} className="relative">
              <input type="radio" name="sex" value={v} defaultChecked={defaults.sex === v} required className="peer sr-only" />
              <span
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center rounded-[10px] text-[15px] font-semibold text-foreground-secondary transition-[background-color,color,scale] duration-150 ease-standard select-none active:scale-[0.96]",
                  "peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/70",
                )}
              >
                {v === "male" ? "Male" : "Female"}
              </span>
            </label>
          ))}
        </div>
        {f?.sex ? (
          <p id="sex-error" className={ERROR}>
            Choose one
          </p>
        ) : (
          <p id="sex-hint" className={HINT}>
            Sex at birth. The fitness and Pulse Age reference ranges differ by sex.
          </p>
        )}
      </fieldset>

      {!onboarding && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4">
          <Field id="heightCm" label="Height" hint="In cm. Adds lean body mass to Pulse Age." error={f?.heightCm} optional>
            <input id="heightCm" name="heightCm" type="number" inputMode="decimal" min={100} max={250} step="0.1" placeholder="cm" defaultValue={defaults.heightCm ?? ""} className={FIELD} {...described("heightCm")} />
          </Field>
          <Field id="maxHr" label="Max heart rate" hint="Leave blank to estimate it from your age." error={f?.maxHr} optional>
            <input id="maxHr" name="maxHr" type="number" inputMode="numeric" min={100} max={240} step="1" placeholder="bpm" defaultValue={defaults.maxHr ?? ""} className={FIELD} {...described("maxHr")} />
          </Field>
        </div>
      )}

      {state?.ok === false && state.error && (
        <p role="alert" className={ERROR}>
          {state.error}
        </p>
      )}
      {footer(pending)}
    </form>
  )
}

export function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" size="sheet" disabled={pending} aria-busy={pending || undefined}>
      {pending ? "Saving…" : label}
    </Button>
  )
}
