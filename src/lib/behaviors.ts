// The journal's behaviour catalogue (journal-04..09): every behaviour a person can add to the daily journal, with the
// sentence the journal asks, its Select Behaviors category and the journal section it sits in. Keys are stored in
// journal_tags and journal_entries; never rename one. The nine defaults keep their original keys.

export const BEHAVIOR_CATEGORIES = [
  { key: "drugs", label: "Drugs & medication" },
  { key: "health", label: "Health & symptoms" },
  { key: "personal", label: "Personal health" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "mental", label: "Mental wellbeing" },
  { key: "nutrition", label: "Nutrition" },
  { key: "recovery", label: "Recovery" },
] as const
export type BehaviorCategory = (typeof BEHAVIOR_CATEGORIES)[number]["key"]

/** The journal's sections (journal-01): when in the day the question is about. Custom behaviours sit under "custom". */
export const JOURNAL_SECTIONS = [
  { key: "daytime", title: "Daytime" },
  { key: "nighttime", title: "Nighttime" },
  { key: "status", title: "Status" },
  { key: "custom", title: "Your behaviours" },
] as const
export type JournalSection = (typeof JOURNAL_SECTIONS)[number]["key"]

/**
 * A follow-up asked once the answer is yes (journal-12): a slider whose value is stored beside the answer.
 * "clock" is minutes after midnight in 30-minute steps; "count" a whole number.
 */
export type FollowUp = { question: string; kind: "clock" | "count"; min: number; max: number; step: number }

export type Behavior = { key: string; label: string; question: string; category: BehaviorCategory; section: Exclude<JournalSection, "custom">; followUp?: FollowUp }

const LAST: FollowUp = { question: "When did you last consume it?", kind: "clock", min: 6 * 60, max: 24 * 60 - 30, step: 30 }

export const BEHAVIORS: readonly Behavior[] = [
  { key: "accutane", label: "Accutane", question: "Took Accutane?", category: "drugs", section: "daytime" },
  { key: "acne", label: "Acne", question: "Experienced acne?", category: "health", section: "status" },
  { key: "acupuncture", label: "Acupuncture", question: "Received acupuncture therapy?", category: "recovery", section: "daytime" },
  { key: "adhd_medication", label: "AD(H)D medication", question: "Took AD(H)D medication?", category: "drugs", section: "daytime" },
  { key: "adaptogens", label: "Adaptogen mushrooms", question: "Took adaptogen mushrooms?", category: "nutrition", section: "daytime" },
  { key: "added_sugar", label: "Added sugar", question: "Consumed added sugar?", category: "nutrition", section: "daytime" },
  { key: "afternoon_snack", label: "Afternoon snack", question: "Ate an afternoon snack?", category: "nutrition", section: "daytime" },
  { key: "air_travel", label: "Air travel", question: "Travelled by plane?", category: "lifestyle", section: "daytime" },
  { key: "alcohol", label: "Alcohol", question: "Had any alcohol?", category: "nutrition", section: "nighttime", followUp: { question: "How many drinks?", kind: "count", min: 1, max: 10, step: 1 } },
  { key: "allergy_medication", label: "Allergy medication", question: "Took allergy medication?", category: "drugs", section: "daytime" },
  { key: "anti_anxiety_medication", label: "Anti-anxiety medication", question: "Took anti-anxiety medication?", category: "drugs", section: "daytime" },
  { key: "anxiety", label: "Anxiety", question: "Felt anxious?", category: "mental", section: "status" },
  { key: "blood_donation", label: "Blood donation", question: "Donated blood?", category: "personal", section: "daytime" },
  { key: "caffeine", label: "Caffeine", question: "Had any caffeine?", category: "nutrition", section: "daytime", followUp: LAST },
  { key: "camping", label: "Camping", question: "Went camping?", category: "lifestyle", section: "nighttime" },
  { key: "car_train_travel", label: "Car or train travel", question: "Travelled by car or train?", category: "lifestyle", section: "daytime" },
  { key: "caregiving", label: "Caregiving", question: "Cared for someone?", category: "lifestyle", section: "daytime" },
  { key: "cold_exposure", label: "Cold exposure", question: "Took a cold plunge or shower?", category: "recovery", section: "daytime" },
  { key: "electrolytes", label: "Electrolytes", question: "Took electrolyte supplements?", category: "nutrition", section: "daytime", followUp: LAST },
  { key: "family_friends", label: "Family and friends", question: "Spent time with family or friends?", category: "mental", section: "daytime" },
  { key: "feeding_baby", label: "Feeding baby at night", question: "Fed a baby at night?", category: "lifestyle", section: "nighttime" },
  { key: "fever", label: "Fever", question: "Experiencing a fever?", category: "health", section: "daytime" },
  { key: "headache", label: "Headache", question: "Had a headache?", category: "health", section: "status" },
  { key: "illness", label: "Illness", question: "Feeling sick or ill?", category: "health", section: "status" },
  { key: "injury", label: "Injury", question: "Dealing with an injury?", category: "health", section: "status" },
  { key: "intermittent_fasting", label: "Intermittent fasting", question: "Fasted for 14 hours or more?", category: "nutrition", section: "daytime" },
  { key: "journaling", label: "Journaling", question: "Wrote in a journal?", category: "mental", section: "nighttime" },
  { key: "late_caffeine", label: "Late caffeine", question: "Had caffeine after 2 PM?", category: "nutrition", section: "daytime" },
  { key: "late_meal", label: "Late meal", question: "Ate within two hours of bed?", category: "nutrition", section: "nighttime" },
  { key: "magnesium", label: "Magnesium", question: "Took magnesium?", category: "nutrition", section: "nighttime" },
  { key: "meditation", label: "Meditation", question: "Meditated?", category: "mental", section: "daytime" },
  { key: "melatonin", label: "Melatonin", question: "Took melatonin?", category: "drugs", section: "nighttime" },
  { key: "menstruating", label: "Menstruating", question: "Menstruating?", category: "personal", section: "status" },
  { key: "mouth_tape", label: "Mouth tape", question: "Wore mouth tape while sleeping?", category: "recovery", section: "nighttime" },
  { key: "nap", label: "Nap", question: "Took a nap?", category: "recovery", section: "daytime" },
  { key: "night_shift", label: "Night shift", question: "Worked the night shift?", category: "lifestyle", section: "nighttime" },
  { key: "on_call", label: "On-call shift", question: "Worked an on-call shift?", category: "lifestyle", section: "nighttime" },
  { key: "outdoor_time", label: "Outdoor time", question: "Spent time outdoors?", category: "lifestyle", section: "daytime" },
  { key: "parenting", label: "Parenting", question: "Spent the day parenting?", category: "lifestyle", section: "daytime" },
  { key: "remote_work", label: "Remote work", question: "Worked from home?", category: "lifestyle", section: "daytime" },
  { key: "sauna", label: "Sauna", question: "Used a sauna?", category: "recovery", section: "daytime" },
  { key: "screen_in_bed", label: "Screen in bed", question: "Used a screen in bed?", category: "lifestyle", section: "nighttime" },
  { key: "sexual_activity", label: "Sexual activity", question: "Had sexual activity?", category: "personal", section: "nighttime" },
  { key: "shared_bed_child", label: "Shared bedroom with child", question: "Shared a bedroom with a child?", category: "lifestyle", section: "nighttime" },
  { key: "sleep_aid", label: "Sleep aid", question: "Took a sleep aid?", category: "drugs", section: "nighttime" },
  { key: "sore_throat", label: "Sore throat", question: "Have a sore throat?", category: "health", section: "status" },
  { key: "stress", label: "Stress", question: "Felt stressed?", category: "mental", section: "status" },
  { key: "stretching", label: "Stretching", question: "Stretched?", category: "recovery", section: "daytime" },
  { key: "therapy", label: "Therapy", question: "Went to a therapy session?", category: "mental", section: "daytime" },
  { key: "travel", label: "Travel", question: "Travelled today?", category: "lifestyle", section: "status" },
]

const BY_KEY = new Map(BEHAVIORS.map((b) => [b.key, b]))
export const behavior = (key: string): Behavior | undefined => BY_KEY.get(key)

/** The journal's question for a tag: the catalogue sentence, or a custom label as a question. */
export const questionOf = (tag: string, label: string) => behavior(tag)?.question ?? `${label}?`

/** A follow-up value as words: "3:30 PM" or "3". */
export function followUpText(f: FollowUp, v: number) {
  if (f.kind === "count") return String(v)
  const h = Math.floor(v / 60) % 24
  return `${h % 12 || 12}:${String(v % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}
