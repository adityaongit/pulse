"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ResponsiveSheet } from "@/components/shells/ResponsiveSheet"
import { ProfileForm, SaveButton, type ProfileDefaults } from "@/components/profile/ProfileForm"
import { disconnectGoogle } from "./actions"

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
    else if (result === "access_denied") toast.error("Google access wasn't granted. Connect again to allow it.", { id })
    else toast.error(`Couldn't connect Google (${result}). Try again.`, { id })
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
            <DialogDescription>Removes every permission Pulse has in your Google account, so you don&apos;t have to do it in Google. Sync stops; your stored data stays on this server.</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-xs leading-4 font-medium text-recovery-red-text">
              Couldn&apos;t reach Google to remove access. Check your connection and try again.
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

/** Settings › Profile's "Edit": the onboarding fields in a sheet (U19). Saving recomputes every day's scores. */
export function EditProfileButton({ defaults }: { defaults: ProfileDefaults }) {
  const [open, setOpen] = React.useState(false)
  const saved = React.useCallback(() => {
    setOpen(false)
    toast.success("Profile saved. Scores are being recomputed.")
  }, [])
  return (
    <>
      <Button variant="secondary" size="touch" onClick={() => setOpen(true)}>
        Edit profile
      </Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Profile" description="Changing it recomputes every day's scores.">
        <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] md:px-6 md:pb-6">
          <ProfileForm defaults={defaults} onSaved={saved} footer={(pending) => <SaveButton pending={pending} label="Save" />} />
        </div>
      </ResponsiveSheet>
    </>
  )
}
