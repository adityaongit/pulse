"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Camera, KeyRound, Monitor, Moon, Pencil, Sun } from "lucide-react"
import { useTheme } from "@/hooks/use-theme"
import { toast } from "sonner"
import { uploadAvatar } from "@/server/actions/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { ProfileForm, SaveButton, type ProfileDefaults } from "@/components/profile/ProfileForm"
import type { Crop } from "@/lib/crop"
import { AuthField } from "@/components/auth/AuthForm"
import { authClient } from "@/lib/auth-client"
import { disconnectGoogle } from "./actions"
import { AvatarCropSheet, decodePhoto, encodeAvatar } from "./AvatarCropSheet"

/** Landing back from Google with `?oauth=connected` or `?oauth=<code>` shows one toast, then drops the param. */
function OAuthToastInner() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const result = params.get("oauth")
  React.useEffect(() => {
    if (!result) return
    // A fixed id: Strict Mode (dev) runs this effect twice before the param is gone, and sonner keeps one toast per id.
    const id = "oauth-result"
    if (result === "connected") toast.success("Google connected", { id })
    else if (result === "expired") toast.error("That Google sign-in link expired or was already used. Connect again.", { id })
    else if (result === "access_denied") toast.error("Google access wasn’t granted. Connect again to allow it.", { id })
    else toast.error(`Couldn’t connect Google (${result}). Try again.`, { id })
    router.replace(`${pathname}${window.location.hash}`, { scroll: false })
  }, [result, router, pathname])
  return null
}

export function OAuthToast() {
  return (
    <React.Suspense fallback={null}>
      <OAuthToastInner />
    </React.Suspense>
  )
}

/** "Disconnect" and its confirmation dialog (spec §7.14). */
export function DisconnectButton() {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState(false)
  const run = async () => {
    setPending(true)
    setError(false)
    const r = await disconnectGoogle().catch(() => ({ ok: false as const, error: "network" }))
    setPending(false)
    if (!r.ok) return setError(true)
    setOpen(false)
    toast.success("Google access removed")
  }
  return (
    <>
      <Button variant="outline" size="touch" className="w-full text-recovery-red-text" onClick={() => setOpen(true)}>
        Disconnect
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>Disconnect Google?</DialogTitle>
            <DialogDescription>Removes every permission Pulse has in your Google account, so you don’t have to do it in Google. Sync stops; your stored data stays on this server.</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-xs leading-4 font-medium text-recovery-red-text">
              Couldn’t reach Google to remove access. Check your connection and try again.
            </p>
          )}
          <DialogFooter>
            <Button variant="secondary" size="touch" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="outline" size="touch" className="text-recovery-red-text" onClick={run} disabled={pending}>
              {pending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * "Switch account": connect a different Google account. Its confirmation says what happens to the data the current
 * account synced, because the callback clears it (journal, profile and dashboard stay).
 */
export function SwitchGoogleButton({ current }: { current: string | null }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button variant="secondary" size="touch" className="w-full" aria-label="Change password" onClick={() => setOpen(true)}>
        Switch Google account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <DialogHeader>
            <DialogTitle>Switch Google account?</DialogTitle>
            <DialogDescription>
              {current ? `Pulse removes what it synced from ${current}` : "Pulse removes the data synced so far"} and imports the new account’s history. Your journal, profile and dashboard stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button asChild size="touch">
              {/* A plain anchor: it leaves the app for Google's account chooser. */}
              <a href="/oauth/start?switch=1">Choose account</a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** A better-auth client call's failure as one line of copy. */
function authErrorText(e: { status?: number; code?: string }, wrongPassword: string) {
  if (e.status === 429) return "Too many tries. Wait a few minutes, then try again."
  if (e.status === 0) return "Couldn’t reach Pulse. Try again."
  if (e.code === "INVALID_PASSWORD") return wrongPassword
  if (e.code === "PASSWORD_TOO_SHORT") return "Use at least 10 characters."
  if (e.code === "PASSWORD_TOO_LONG") return "Use at most 128 characters."
  return "Something went wrong. Try again."
}
const offline = () => ({ data: null, error: { status: 0 } })

/** Settings › Account › Change password, in a sheet. Other devices are signed out when it saves. */
export function ChangePasswordButton() {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    const { error: err } = await authClient
      .changePassword({ currentPassword: String(form.get("current")), newPassword: String(form.get("next")), revokeOtherSessions: true })
      .catch(offline)
    setPending(false)
    if (err) return setError(authErrorText(err, "Current password is incorrect."))
    setOpen(false)
    toast.success("Password changed. Other devices are signed out.")
  }
  return (
    <>
      <Button variant="secondary" size="touch" className="w-full" aria-label="Change password" onClick={() => setOpen(true)}>
        <KeyRound aria-hidden strokeWidth={2} />
        Password
      </Button>
      <ResponsiveSheet
        open={open}
        onOpenChange={(o) => {
          if (pending) return
          setOpen(o)
          setError(null)
        }}
        title="Change password"
        description="Other devices are signed out."
      >
        <form onSubmit={submit} className="flex flex-col gap-5 px-4 pb-[max(env(safe-area-inset-bottom),16px)] md:px-6 md:pb-6">
          <AuthField label="Current password" name="current" type="password" autoComplete="current-password" required />
          <AuthField label="New password" name="next" type="password" autoComplete="new-password" required minLength={10} maxLength={128} hint="At least 10 characters." />
          {error && (
            <p role="alert" className="px-1 text-[13px] leading-[18px] font-medium text-recovery-red-text">
              {error}
            </p>
          )}
          <SaveButton pending={pending} label="Change password" />
        </form>
      </ResponsiveSheet>
    </>
  )
}

/**
 * Settings › Account › Delete account: asks for the password, then removes the account and everything stored for it
 * (the database cascades every per-user table). Lands on sign-up.
 */
export function DeleteAccountButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const password = String(new FormData(e.currentTarget).get("password"))
    setPending(true)
    setError(null)
    const { error: err } = await authClient.deleteUser({ password }).catch(offline)
    if (err) {
      setPending(false)
      return setError(authErrorText(err, "Password is incorrect."))
    }
    router.replace("/signup")
    router.refresh()
  }
  return (
    <>
      <Button
        variant="ghost"
        // Outlined in red: easy to find, clearly destructive, still quieter than the everyday buttons above.
        className="h-11 rounded-full px-5 text-[13px] font-bold tracking-[0.06em] text-recovery-red-text uppercase ring-1 ring-recovery-red/45 hover:bg-recovery-red/10 hover:text-recovery-red-text"
        onClick={() => setOpen(true)}
      >
        Delete account
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return
          setOpen(o)
          setError(null)
        }}
      >
        <DialogContent showCloseButton={false} className="ring-1 ring-border">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                Removes your account and everything Pulse stored for it: synced data, scores, journal, profile and the Google connection. This can’t be undone.
              </DialogDescription>
            </DialogHeader>
            <AuthField label="Password" name="password" type="password" autoComplete="current-password" required autoFocus />
            {error && (
              <p role="alert" className="px-1 text-[13px] leading-[18px] font-medium text-recovery-red-text">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" size="touch" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="outline" size="touch" className="text-recovery-red-text" disabled={pending} aria-busy={pending || undefined}>
                {pending ? "Deleting…" : "Delete account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Settings › Profile's "Edit": the onboarding fields in a sheet (U19). Saving recomputes every day's scores. */
export function EditProfileButton({ defaults }: { defaults: ProfileDefaults }) {
  const [open, setOpen] = React.useState(false)
  const saved = React.useCallback(() => {
    setOpen(false)
    toast.success("Profile saved. Scores are being recomputed.")
  }, [])
  return (
    <>
      <Button
        variant="ghost"
        aria-label="Edit profile"
        onClick={() => setOpen(true)}
        className="relative -my-2 h-9 gap-1.5 rounded-full px-3 after:absolute after:-inset-y-1 text-[13px] font-semibold text-foreground-secondary hover:bg-foreground/[0.06] hover:text-foreground"
      >
        <Pencil aria-hidden strokeWidth={2} className="size-3.5" />
        Edit
      </Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Profile" description="Changing it recomputes every day’s scores.">
        <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] md:px-6 md:pb-6">
          <ProfileForm defaults={defaults} onSaved={saved} footer={(pending) => <SaveButton pending={pending} label="Save profile" />} />
        </div>
      </ResponsiveSheet>
    </>
  )
}

/** Upload failures as a message, never a throw: a thrown action error would replace Settings with the error screen. */
const UPLOAD_FAILED = "Couldn’t upload the photo. Check your connection and try again."

/**
 * Settings › Account: change the photo (pick, crop in a sheet, then upload a 512 px WebP) and, for an uploaded one,
 * remove it. The photo is shrunk in the browser so a phone photo never meets the Server Action body limit.
 */
export function AvatarButtons() {
  const router = useRouter()
  const input = React.useRef<HTMLInputElement>(null)
  const [pending, start] = React.useTransition()
  const [photo, setPhoto] = React.useState<ImageBitmap | null>(null)
  const [cropping, setCropping] = React.useState(false)
  const [opening, setOpening] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => () => photo?.close(), [photo])
  const done = (r: { ok: boolean; error?: string }, ok: string) => {
    if (!r.ok) {
      toast.error(r.error ?? "Couldn’t update the photo", { id: "avatar" })
      return
    }
    router.refresh()
    toast.success(ok, { id: "avatar" })
  }
  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = "" // so picking the same file again still fires change
    if (!file) return
    setOpening(true)
    const bitmap = await decodePhoto(file)
    setOpening(false)
    if (!bitmap) {
      toast.error("Couldn’t open this photo. Choose a JPEG, PNG or WebP.", { id: "avatar" })
      return
    }
    setError(null)
    setPhoto(bitmap)
    setCropping(true)
  }
  const use = (crop: Crop) => {
    if (!photo) return
    setError(null)
    start(async () => {
      const r = await encodeAvatar(photo, crop)
        .then((blob) => {
          const form = new FormData()
          form.set("photo", new File([blob], blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg", { type: blob.type }))
          return uploadAvatar(form)
        })
        .catch(() => ({ ok: false as const, error: UPLOAD_FAILED }))
      if (!r.ok) return setError(r.error)
      setCropping(false)
      done(r, "Photo updated")
    })
  }
  return (
    <div className="flex">
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <Button variant="secondary" size="touch" className="flex-1" disabled={pending || opening} onClick={() => input.current?.click()}>
        <Camera aria-hidden strokeWidth={2} />
        {opening ? "Opening…" : pending && !cropping ? "Saving…" : "Photo"}
      </Button>
      <AvatarCropSheet photo={photo} open={cropping} pending={pending} error={error} onCancel={() => setCropping(false)} onUse={use} />
    </div>
  )
}

const THEMES = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const

/**
 * Appearance: system, light or dark, as a radio group styled like the profile's segmented control. Kept per device
 * (stored locally), so a phone can follow the system while a laptop stays dark.
 */
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-field p-1">
        {THEMES.map(({ value, label, Icon }) => (
          <label key={value} className="relative">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
              className="peer sr-only"
            />
            <span className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold text-foreground-secondary transition-[background-color,color,scale] duration-150 ease-standard select-none active:scale-[0.96] peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/70">
              <Icon aria-hidden className="size-4" strokeWidth={2} />
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
