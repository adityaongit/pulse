"use client"

import { ProfileForm, SaveButton } from "@/components/profile/ProfileForm"
import { AuthShell } from "@/components/shells/AuthShell"

/** One form, not a wizard: four fields fit one phone screen, and two of them are optional. */
export function Onboarding() {
  return (
    <AuthShell align="top">
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-balance">A few things about you</h1>
      <p className="mt-2 mb-8 text-[16px] leading-6 text-pretty text-foreground-secondary">
        Pulse scores your heart rate against your age and sex. You can change these later in Settings.
      </p>
      <ProfileForm
        onboarding
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
