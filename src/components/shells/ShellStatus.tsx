"use client"

import * as React from "react"

/** Global shell state read by the top bar, sync dot, demo chip and ConnectionBanner (spec §4.2, D2). */
export type ShellStatus = {
  mode: "demo" | "google"
  sync: { state: "ok" | "syncing" | "stale" | "error"; lastSuccessAt: number | null }
  connection: "connected" | "not_connected" | "importing" | "auth_revoked" | "stale"
  importProgress?: { done: number; total: number }
  /** Today (YYYY-MM-DD) in the user's zone, from the server, so client and server agree. */
  today: string
  /** First stored day; the DateSwitcher's prev button and calendar stop here. */
  firstDay?: string
  /** IANA zone for clock times in client-rendered charts. */
  timeZone?: string
}

const Ctx = React.createContext<ShellStatus | null>(null)

export function ShellStatusProvider({ value, children }: { value: ShellStatus; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShellStatus() {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useShellStatus must be used inside AppShell")
  return v
}

/** Like useShellStatus, for kit components that also render outside a shell (tests, gallery). */
export const useOptionalShellStatus = () => React.useContext(Ctx)
