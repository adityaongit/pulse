// What Pulse can log to Google Health (spec §11 LG1): the Google data types, the write scope each needs, and the
// choices the log sheets offer. Shared by the sheets, the log actions and the Google writer.

/** Google data types Pulse writes. Moods, symptoms, periods and ovulation tests are write-only at Google. */
export const LOG_TYPES = ["hydration-log", "nutrition-log", "weight", "body-fat", "moods", "symptoms", "menstrual-period", "ovulation-test"] as const
export type LogType = (typeof LOG_TYPES)[number]

/** The `googlehealth.<x>.writeonly` scope each type needs. Grants made before 2026-10 have only nutrition's. */
export const WRITE_SCOPE: Record<LogType, string> = {
  "hydration-log": "nutrition",
  "nutrition-log": "nutrition",
  weight: "health_metrics_and_measurements",
  "body-fat": "health_metrics_and_measurements",
  moods: "mindfulness",
  symptoms: "logged_symptoms",
  "menstrual-period": "reproductive_health",
  "ovulation-test": "reproductive_health",
}

/** The action error a log sheet turns into its Reconnect Google call to action. */
export const RECONNECT = "reconnect"

export const scopeUrl = (type: LogType) => `https://www.googleapis.com/auth/googlehealth.${WRITE_SCOPE[type]}.writeonly`

/** Types Google lets Pulse read back: the sync brings them home, so totals come from the sync, not this log. */
export const READABLE: ReadonlySet<LogType> = new Set(["hydration-log", "nutrition-log", "weight", "body-fat"])

/** Google's `dataSource.platform` values as people know them; anything else is shown title-cased. */
const APPS: Record<string, string> = { FITBIT: "Fitbit", HEALTH_CONNECT: "Health Connect", GOOGLE_WEB_API: "Another app" }

/** Where an entry was logged: Pulse, or the app Google names for it. */
export function appLabel(source: string, app: string | null): string {
  if (source === "pulse") return "Pulse"
  if (!app) return "Another app"
  return APPS[app] ?? app.charAt(0) + app.slice(1).toLowerCase().replaceAll("_", " ")
}

/** The sync brings other apps' entries home for this many local days (Journal lists them for those days only). */
export const LOG_DAYS = 14

/** Cycle tracking: never offered, shown or accepted on a male profile. */
export const CYCLE: ReadonlySet<LogType> = new Set(["menstrual-period", "ovulation-test"])

/** One sheet per kind; Weight writes weight and, when given, body fat. */
export const LOG_KINDS = ["water", "food", "weight", "mood", "symptoms", "period", "ovulation"] as const
export type LogKind = (typeof LOG_KINDS)[number]
export const KIND_TYPES: Record<LogKind, LogType[]> = {
  water: ["hydration-log"],
  food: ["nutrition-log"],
  weight: ["weight", "body-fat"],
  mood: ["moods"],
  symptoms: ["symptoms"],
  period: ["menstrual-period"],
  ovulation: ["ovulation-test"],
}
export const KIND_LABEL: Record<LogKind, string> = {
  water: "Water",
  food: "Food",
  weight: "Weight",
  mood: "Mood",
  symptoms: "Symptoms",
  period: "Period",
  ovulation: "Ovulation test",
}
export const isCycleKind = (k: LogKind) => k === "period" || k === "ovulation"

/** The coach's log tools (src/server/coach/logTools.ts), one per kind; each waits for the user's approval. */
export const LOG_TOOLS = ["log_water", "log_food", "log_weight", "log_mood", "log_symptoms", "log_period", "log_ovulation"] as const
export type LogToolName = (typeof LOG_TOOLS)[number]
export const isLogTool = (name: string): name is LogToolName => (LOG_TOOLS as readonly string[]).includes(name)

export const WATER_STEPS = [250, 500] as const

export const MEALS = [
  ["BREAKFAST", "Breakfast"],
  ["LUNCH", "Lunch"],
  ["DINNER", "Dinner"],
  ["SNACK", "Snack"],
] as const
export type Meal = (typeof MEALS)[number][0]

/** Google's valence enum, in the order the sheet shows it. */
export const VALENCES = [
  ["UNPLEASANT", "Unpleasant"],
  ["BASELINE", "Neutral"],
  ["PLEASANT", "Pleasant"],
] as const
export type Valence = (typeof VALENCES)[number][0]

/** A short list from Google's 70-odd moods: the ones a daily log reaches for. No NEUTRAL: the valence row has it. */
export const MOODS = [
  ["HAPPY", "Happy"],
  ["CALM", "Calm"],
  ["ENERGIZED", "Energized"],
  ["CONTENT", "Content"],
  ["GRATEFUL", "Grateful"],
  ["EXCITED", "Excited"],
  ["FATIGUED", "Tired"],
  ["STRESSED", "Stressed"],
  ["ANXIOUS", "Anxious"],
  ["IRRITATED", "Irritated"],
  ["SAD", "Sad"],
  ["OVERWHELMED", "Overwhelmed"],
  ["LONELY", "Lonely"],
] as const
export type Mood = (typeof MOODS)[number][0]

/** A short list from Google's symptom enum. `cycle` ones show on female profiles only. */
export const SYMPTOMS = [
  ["HEADACHE", "Headache", false],
  ["FATIGUE", "Fatigue", false],
  ["SICK", "Feeling sick", false],
  ["FEVER", "Fever", false],
  ["COUGH", "Cough", false],
  ["NAUSEA", "Nausea", false],
  ["DIZZINESS", "Dizziness", false],
  ["BRAIN_FOG", "Brain fog", false],
  ["BACK_PAIN", "Back pain", false],
  ["JOINT_PAIN", "Joint pain", false],
  ["INSOMNIA", "Insomnia", false],
  ["HEARTBURN", "Heartburn", false],
  ["BLOATED", "Bloating", false],
  ["DIARRHEA", "Diarrhea", false],
  ["CONSTIPATION", "Constipation", false],
  ["CRAMPS", "Cramps", true],
  ["TENDER_BREASTS", "Tender breasts", true],
  ["PMS", "PMS", true],
  ["ACNE", "Acne", true],
  ["HOT_FLASHES", "Hot flashes", true],
] as const
export type Symptom = (typeof SYMPTOMS)[number][0]
export const CYCLE_SYMPTOMS: ReadonlySet<string> = new Set(SYMPTOMS.filter((s) => s[2]).map((s) => s[0]))

/** Google records period flow nowhere but free-text notes, so Pulse keeps it locally and writes it into `notes`. */
export const FLOWS = [
  ["SPOTTING", "Spotting"],
  ["LIGHT", "Light"],
  ["MEDIUM", "Medium"],
  ["HEAVY", "Heavy"],
] as const
export type Flow = (typeof FLOWS)[number][0]

export const OVULATION_RESULTS = [
  ["NEGATIVE", "Negative"],
  ["POSITIVE", "Positive"],
  ["LUTEINIZING_HORMONE_SURGE", "LH surge"],
  ["ESTROGEN_SURGE", "Estrogen surge"],
  ["INDETERMINATE", "Unclear"],
] as const
export type OvulationResult = (typeof OVULATION_RESULTS)[number][0]

const labelOf = (list: readonly (readonly [string, string, ...unknown[]])[], v: string) => list.find((x) => x[0] === v)?.[1] ?? v

/** What a logged entry's `data` holds, per type. Moods and symptoms keep Google's enum values, for Behaviour Insights later. */
export type LogData = {
  "hydration-log": { ml: number }
  "nutrition-log": { name: string | null; meal: Meal; kcal: number; protein: number | null; carbs: number | null; fat: number | null }
  weight: { kg: number }
  "body-fat": { pct: number }
  moods: { moods: Mood[]; valence: Valence | null }
  symptoms: { symptoms: Symptom[] }
  "menstrual-period": { start: string; end: string; flow: Flow | null }
  "ovulation-test": { result: OvulationResult }
}

/** One line for the recent-log list. */
export function describeEntry(type: LogType, data: unknown): { title: string; detail: string } {
  const n = (v: number) => v.toLocaleString("en-US")
  switch (type) {
    case "hydration-log":
      return { title: "Water", detail: `${n((data as LogData[typeof type]).ml)} ml` }
    case "nutrition-log": {
      const f = data as LogData[typeof type]
      const macros = [f.protein != null && `${f.protein} g protein`, f.carbs != null && `${f.carbs} g carbs`, f.fat != null && `${f.fat} g fat`]
      return { title: f.name ?? labelOf(MEALS, f.meal), detail: [`${n(f.kcal)} kcal`, ...macros].filter(Boolean).join(", ") }
    }
    case "weight":
      return { title: "Weight", detail: `${(data as LogData[typeof type]).kg} kg` }
    case "body-fat":
      return { title: "Body fat", detail: `${(data as LogData[typeof type]).pct}%` }
    case "moods": {
      const m = data as LogData[typeof type]
      return { title: "Mood", detail: [m.valence && labelOf(VALENCES, m.valence), ...m.moods.map((x) => labelOf(MOODS, x))].filter(Boolean).join(", ") }
    }
    case "symptoms":
      return { title: "Symptoms", detail: (data as LogData[typeof type]).symptoms.map((x) => labelOf(SYMPTOMS, x)).join(", ") }
    case "menstrual-period": {
      const p = data as LogData[typeof type]
      const days = Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86_400_000) + 1
      return { title: "Period", detail: [`${days} ${days === 1 ? "day" : "days"}`, p.flow && `${labelOf(FLOWS, p.flow).toLowerCase()} flow`].filter(Boolean).join(", ") }
    }
    case "ovulation-test":
      return { title: "Ovulation test", detail: labelOf(OVULATION_RESULTS, (data as LogData[typeof type]).result) }
  }
}
