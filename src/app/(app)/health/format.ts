import { formatValue, LOCALE } from "@/lib/format"

const ORDINAL = new Intl.PluralRules(LOCALE, { type: "ordinal" })
const SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "st", two: "nd", few: "rd" }

/** 78 → "78th"; the plural category comes from Intl.PluralRules. */
export const ordinal = (n: number) => {
  const r = Math.round(n)
  return `${r}${SUFFIX[ORDINAL.select(r)] ?? "th"}`
}

/** "2.3 years younger" / "1.0 years older" / "Same as your age" (spec §6), with its tone class. */
export function ageDelta(delta: number) {
  const v = formatValue("decimal1", Math.abs(delta))
  if (v === "0.0") return { text: "Same as your age", tone: "text-foreground-secondary" }
  return delta < 0 ? { text: `${v}\u00a0years younger`, tone: "text-optimal-text" } : { text: `${v}\u00a0years older`, tone: "text-warning-text" }
}

/** "excellent" (the core's key) → "Excellent". */
export const categoryWord = (c: string) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()

/** VO2 max category word colour (spec §7.6). */
export function categoryTone(c: string) {
  const k = c.toLowerCase()
  return k === "excellent" || k === "superior" ? "text-optimal-text" : k === "good" ? "text-foreground" : "text-warning-text"
}
