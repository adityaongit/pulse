// Shared by `pnpm shots` and `pnpm screens`: the demo app's screens, the two device sizes, a demo session, and the
// in-page helpers that end a phone screen on a clean row. Both scripts drive a running demo-mode app:
//   DATA_SOURCE=demo TZ=Asia/Kolkata pnpm dev -p 3317   (repo root, in another terminal)
// Demo mode scores the day so far, so capture in the evening (a morning capture shows 0.0 strain), and in one run,
// so the laptop and phone show the same numbers.
import { createRequire } from "node:module"

const require = createRequire(new URL("../../package.json", import.meta.url))
export const { chromium } = require("@playwright/test")

export const APP = process.env.APP_URL ?? "http://localhost:3317"

export const SCREENS = [
  ["home", "/"],
  ["recovery", "/recovery"],
  ["strain", "/strain"],
  ["sleep", "/sleep"],
  ["health", "/health"],
  ["health-monitor", "/health/monitor"],
  ["journal", "/journal"],
  ["stress", "/health/stress"],
  ["healthspan", "/health/healthspan"],
  ["reports", "/reports"],
  ["trends", "/trends"],
  ["dashboard-editor", "/", (page) => page.getByRole("button", { name: "Customize My Dashboard" }).click()],
]

// The phone's status bar is drawn by the frame, so the page gets the rest of an 844 pt screen.
export const STATUS = 50
export const DEVICES = {
  phone: { viewport: { width: 390, height: 844 - STATUS }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
}

// The coach is never on in demo mode, so it is captured from a second app in Google mode with the scripted model:
//   pnpm seed:demo against its database, server_settings coach = everyone, and coach_settings provider/model "mock"
//   with consent for the demo account; then run it with DATA_SOURCE=google COACH_MOCK=true on COACH_APP_URL.
export const COACH_APP = process.env.COACH_APP_URL

/** A session cookie for the seeded demo account on the coach app (email sign-in; a Google instance has no demo route). */
export async function coachSession() {
  const res = await fetch(`${COACH_APP}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: COACH_APP },
    body: JSON.stringify({ email: "demo@pulse.local", password: "pulse-demo-generated-data" }),
  })
  const token = /better-auth\.session_token=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1]
  if (!token) throw new Error(`No session from ${COACH_APP}: is the demo account seeded there?`)
  return token
}

/** A demo session cookie from the running app. */
export async function demoSession() {
  const res = await fetch(`${APP}/login/demo`, { method: "POST", redirect: "manual" })
  const token = /better-auth\.session_token=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1]
  if (!token) throw new Error(`No demo session from ${APP}/login/demo: is the app running in demo mode?`)
  return token
}

// Hides the scrolling content (not the fixed or sticky header and bars) whose box matches `test`. Exposed to the page.
export const HIDE = `window.hideWhere = (test) => {
  const pinned = (e) => { for (; e; e = e.parentElement) if (/fixed|sticky/.test(getComputedStyle(e).position)) return true }
  for (const e of document.querySelectorAll("main *")) {
    const r = e.getBoundingClientRect()
    if (r.height && test(r) && !pinned(e)) e.style.visibility = "hidden"
  }
}`

// Runs in the page. Every phone screen keeps the full screen height (so the site's phones are one size), and its
// content ends on a row or card boundary rather than mid-row: the lowest y on the screen that no row, chip, line of
// text or icon crosses. Containers taller than a few rows (a card of rows) may be cut between their rows. Everything
// below the cut is hidden, so the content ends on a gap of background (or of the card being cut). Content runs on
// under the floating tab bar's glass, as it does in the app, so the screen never ends on an empty band above it.
export function cleanCut({ maxH, minH }) {
  // A sheet (the dashboard editor) fills the screen and ends on its own buttons.
  if (document.querySelector("[role=dialog]")) return maxH
  const ROW = 240
  const bar = [...document.querySelectorAll("body *")]
    .filter((e) => getComputedStyle(e).position === "fixed" && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().bottom > maxH - 120)
    .reduce((top, e) => Math.min(top, e.getBoundingClientRect().top), maxH)
  const inset = maxH - bar // space the bottom bar takes, 0 without one
  const boxes = [] // what a cut must not cross
  const ends = new Set() // where a cut may fall: the bottom of any row, card or line
  const solid = (c) => !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor) || c.backgroundImage !== "none" || c.boxShadow !== "none" || parseFloat(c.borderTopWidth) + parseFloat(c.borderBottomWidth) > 0
  for (const e of document.querySelectorAll("main *")) {
    const c = getComputedStyle(e)
    if (c.visibility === "hidden" || c.display === "none" || c.position === "fixed" || c.position === "sticky") continue
    const r = e.getBoundingClientRect()
    if (!r.height || !r.width) continue
    const ink = /^(svg|img|canvas|video|input|button)$/i.test(e.tagName)
    if (ink || solid(c)) ends.add(Math.ceil(r.bottom))
    // A row: a short box with a background or divider, or a short group of several parts (label, bar, caption).
    if (ink || (r.height <= ROW && (solid(c) || e.children.length > 1))) boxes.push([r.top, r.bottom])
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const t of range.getClientRects()) boxes.push([t.top, t.bottom]), ends.add(Math.ceil(t.bottom))
    }
  }
  // A row that runs off the bottom of the screen may be cut under a bar: it scrolls on under the glass in the app.
  const crosses = (y) => boxes.some(([t, b]) => t < y - 0.5 && b > y + 0.5 && !(inset && b > maxH))
  // With a bar: anywhere on the screen, under the bar's glass. Without: a gap of plain background that clears the
  // screen's rounded corners.
  const fits = (y) => (inset ? y <= maxH : y + 28 <= maxH)
  const cut = [...ends].sort((a, b) => b - a).find((y) => y >= minH && fits(y) && !crosses(y))
  if (!cut) throw new Error(`No clean cut on ${location.pathname}`)
  hideWhere((r) => r.top >= cut)
  return maxH
}

// Runs in the page. The landing page shows the app as a person sees it, so demo mode's own labels come off: the
// "Demo data" chip, "Demo" in the sync slot (the band icon and its dot stay) and the Journal's demo caption.
export function undemo() {
  for (const e of document.querySelectorAll("body *")) {
    const t = e.textContent.trim()
    if (e.children.length <= 1 && t === "Demo data") e.remove()
    else if (e.tagName === "P" && t.startsWith("Demo: ")) e.remove()
  }
  for (const e of document.querySelectorAll('[aria-label^="Demo data."]'))
    for (const n of [...e.querySelectorAll("*"), e].flatMap((x) => [...x.childNodes])) if (n.nodeType === 3 && n.textContent.trim() === "Demo") n.remove()
}

/** Opens one screen at one device size, ready to capture; returns its height (a phone's content ends on a clean row). */
export async function openScreen(page, kind, [, path, act]) {
  const opts = DEVICES[kind]
  await page.setViewportSize(opts.viewport)
  await page.goto(APP + path, { waitUntil: "networkidle" })
  await page.evaluate(HIDE)
  // Not part of the screen: the dev-mode indicator. The phone's round P action (check-in, or the coach) stays: it is
  // on every screen of the real app.
  await page.addStyleTag({ content: `nextjs-portal { display: none !important; }` })
  await page.evaluate(undemo)
  if (act) await act(page, kind)
  await page.evaluate(undemo) // the dashboard editor's sheet renders after the act
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
  let height = opts.viewport.height
  if (kind === "phone") {
    height = await page.evaluate(cleanCut, { maxH: height, minH: 480 })
  }
  return height
}
