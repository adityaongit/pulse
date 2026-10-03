"use client"

import * as React from "react"

/** Global shell state read by the headers, nav, sync status and ConnectionBanner (spec §4.2, D2). */
export type ShellStatus = {
  mode: "demo" | "google"
  sync: { state: "ok" | "syncing" | "stale" | "error"; lastSuccessAt: number | null }
  connection: "connected" | "not_connected" | "not_linked" | "importing" | "auth_revoked" | "stale"
  importProgress?: { done: number; total: number }
  /** Today (YYYY-MM-DD) in the user's zone, from the server, so client and server agree. */
  today: string
  /** First stored day; the DateSwitcher's prev button and calendar stop here. */
  firstDay?: string
  /** IANA zone for clock times in client-rendered charts. */
  timeZone?: string
  /** Consecutive worn days (Home header streak pill, spec §4.3); null or missing at 0. */
  streak?: { days: number; asOf: string } | null
  /** The avatar photo (src/server/avatar.ts); null draws a blobatar from `avatarSeed`. */
  avatar?: string | null
  avatarSeed?: string
}

const Ctx = React.createContext<ShellStatus | null>(null)

/** The calendar facts most components need: they change once a day, not on every sync. */
export type ShellCalendar = Pick<ShellStatus, "today" | "firstDay" | "timeZone">
const CalendarCtx = React.createContext<ShellCalendar | null>(null)

/**
 * Two contexts, so a sync or a `router.refresh()` re-renders only what shows sync state (headers, banner, nav
 * status), not every chart and date control. The server sends a new status object on each refresh, so both values
 * are rebuilt only when their fields actually change: a refresh with nothing new re-renders no consumer.
 */
export function ShellStatusProvider({ value, children }: { value: ShellStatus; children: React.ReactNode }) {
  const { today, firstDay, timeZone } = value
  const calendar = React.useMemo(() => ({ today, firstDay, timeZone }), [today, firstDay, timeZone])
  const key = JSON.stringify(value)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content: a new object with the same fields is the same status
  const status = React.useMemo(() => value, [key])
  return (
    <CalendarCtx.Provider value={calendar}>
      <Ctx.Provider value={status}>{children}</Ctx.Provider>
    </CalendarCtx.Provider>
  )
}

/** The full status: sync state, connection, import progress, streak, avatar. For the chrome that shows them. */
export function useShellStatus() {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useShellStatus must be used inside AppShell")
  return v
}

/** Like useShellStatus, for kit components that also render outside a shell (tests, gallery). */
export const useOptionalShellStatus = () => React.useContext(Ctx)

/** Today, the first stored day and the time zone. Prefer this over useShellStatus when that is all you read. */
export function useShellCalendar() {
  const v = React.useContext(CalendarCtx)
  if (!v) throw new Error("useShellCalendar must be used inside AppShell")
  return v
}

/** Like useShellCalendar, for kit components that also render outside a shell (tests, gallery). */
export const useOptionalShellCalendar = () => React.useContext(CalendarCtx)
