import { formatValue } from "@/lib/format"

/** 78 → "78th". */
export const ordinal = (n: number) => {
  const r = Math.round(n)
  const s = r % 100 >= 11 && r % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[r % 10] ?? "th"
  return `${r}${s}`
}

/** "2.3 years younger" / "1.0 years older" / "Same as your age" (spec §6), with its tone class. */
export function ageDelta(delta: number) {
  const v = formatValue("decimal1", Math.abs(delta))
  if (v === "0.0") return { text: "Same as your age", tone: "text-foreground-secondary" }
  return delta < 0 ? { text: `${v} years younger`, tone: "text-optimal" } : { text: `${v} years older`, tone: "text-warning" }
}

/** "excellent" (the core's key) → "Excellent". */
export const categoryWord = (c: string) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()

/** VO2 max category word colour (spec §7.6). */
export function categoryTone(c: string) {
  const k = c.toLowerCase()
  return k === "excellent" || k === "superior" ? "text-optimal" : k === "good" ? "text-foreground" : "text-warning"
}
