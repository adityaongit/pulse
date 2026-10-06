// The app's own screens as static HTML (src/kit/screens, captured from demo mode by `pnpm screens`). Never
// third-party UI. Device.astro frames them; src/kit/kit.css styles them.
import type { Shot } from "../data/metrics"

const files = import.meta.glob<string>("../kit/screens/*.html", { query: "?raw", import: "default", eager: true })

const ALT: Record<string, string> = {
  home: "Home: the Sleep, Recovery and Strain dials, the Health and Stress Monitor cards and the day's activities",
  recovery: "Recovery: today's score and its contributors (HRV, resting heart rate, breathing, sleep, skin temperature) against your baselines",
  strain: "Strain: the day's 0-21 Strain, the Strain Target range, heart rate zones and steps",
  sleep: "Sleep: Sleep Performance, with hours against need, consistency, efficiency and restorative sleep",
  health: "Health: Pulse Age and Pace of Aging, with the Health Monitor below",
  "health-monitor": "Health Monitor: last night's vitals against your normal range, heart rhythm and measurements",
  journal: "Journal: the week strip, the Log for water, food, weight and mood, and the evening check-in",
  trends: "Trends: Recovery by day over the past month, with weekly and monthly averages",
  "dashboard-editor": "My Dashboard: choose the metrics on Home and their order",
  stress: "Stress Monitor: today's stress on a 0-3 dial, with a line on how the day went",
  healthspan: "Healthspan: Pulse Age against your real age, and your Pace of Aging",
  reports: "Reports: a weekly and monthly summary of Recovery, sleep and strain",
  coach: "Coach: a question about today's Recovery, answered with the day's scores and what moved them",
}

export type Part = `dial-${"sleep" | "recovery" | "strain"}`

/** One captured screen (or dial): its markup and the size it was laid out at. */
export function screen(s: Shot | Part) {
  const html = files[`../kit/screens/${s}.html`]
  if (!html) throw new Error(`Missing src/kit/screens/${s}.html: run \`pnpm screens\``)
  const [, w, h] = /--kit-w:(\d+)px;--kit-h:(\d+)px/.exec(html)!.map(Number)
  // The colour at the top of a phone screen, for the frame's status bar above it.
  const top = /--kit-top:(#[0-9a-f]{6})/.exec(html)?.[1]
  const [device, ...rest] = s.split("-")
  const alt = device === "dial" ? "" : `Pulse on a ${device}. ${ALT[rest.join("-")]}`
  return { html, width: w, height: h, alt, top }
}

export function isPhone(s: Shot) {
  return s.startsWith("phone")
}
