"use client"

import { ProfileForm, SaveButton } from "@/components/profile/ProfileForm"
import { AuthShell } from "@/components/shells/AuthShell"

/**
 * First run: only what Google can't tell us. Its Health profile has an age in whole years but no birth date
 * and no sex; height and weight come from Google data later, max HR is estimated. `age` opens the date
 * picker on the right year.
 */
export function Onboarding({ age }: { age: number | null }) {
  const year = new Date().getFullYear()
  return (
    <AuthShell align="top">
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-balance">Two things Google doesn&apos;t share</h1>
      <p className="mt-2 mb-8 text-[16px] leading-6 text-pretty text-foreground-secondary">
        Pulse scores your heart rate against your age and sex. Everything else comes from your Fitbit data. You can change these later in Settings.
      </p>
      <ProfileForm
        onboarding
        startYear={age ? year - age - 1 : undefined}
        defaults={{ birthDate: "", sex: null, maxHr: null, heightCm: null }}
        footer={(pending) => (
          <div className="sticky bottom-0 -mx-5 mt-2 bg-linear-to-t from-background via-background/95 to-transparent px-5 pt-6 pb-[max(env(safe-area-inset-bottom),24px)]">
            <SaveButton pending={pending} label="Continue" />
          </div>
        )}
      />
    </AuthShell>
  )
}
