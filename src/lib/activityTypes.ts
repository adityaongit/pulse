// The activity types a person can log or record (activity-07, activity-09): Select Activity's catalogue. Static; the
// hidden Add Activity and Start Activity flows read it (FEATURES.logActivity, FEATURES.startActivity).
import type { ActivityKind } from "@/server/queries/types"

/** Select Activity's tabs: what the activity does for you. */
export const ACTIVITY_CATEGORIES = [
  { key: "strain", label: "Strain" },
  { key: "recovery", label: "Recovery" },
  { key: "sleep", label: "Sleep" },
] as const
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]["key"]

/** `kind` picks the icon and how Pulse files the activity (src/server/queries/common.ts activityKind). */
export type ActivityType = { key: string; label: string; category: ActivityCategory; kind: ActivityKind }

const t = (key: string, label: string, category: ActivityCategory, kind: ActivityKind = "workout"): ActivityType => ({ key, label, category, kind })

/** A to Z. */
export const ACTIVITY_TYPES: readonly ActivityType[] = [
  t("acupuncture", "Acupuncture", "recovery"),
  t("air_compression", "Air compression", "recovery"),
  t("american_football", "American football", "strain"),
  t("badminton", "Badminton", "strain"),
  t("barre", "Barre", "strain"),
  t("baseball", "Baseball", "strain"),
  t("basketball", "Basketball", "strain"),
  t("boxing", "Boxing", "strain"),
  t("breathwork", "Breathwork", "recovery"),
  t("climbing", "Climbing", "strain"),
  t("cricket", "Cricket", "strain"),
  t("cycling", "Cycling", "strain", "ride"),
  t("dance", "Dance", "strain"),
  t("elliptical", "Elliptical", "strain"),
  t("functional_fitness", "Functional fitness", "strain", "strength"),
  t("golf", "Golf", "strain", "walk"),
  t("hiit", "HIIT", "strain"),
  t("hiking", "Hiking", "strain", "walk"),
  t("ice_bath", "Ice bath", "recovery"),
  t("martial_arts", "Martial arts", "strain"),
  t("massage", "Massage", "recovery"),
  t("meditation", "Meditation", "recovery"),
  t("mountain_biking", "Mountain biking", "strain", "ride"),
  t("nap", "Nap", "sleep"),
  t("padel", "Padel", "strain"),
  t("pilates", "Pilates", "strain"),
  t("rowing", "Rowing", "strain"),
  t("rugby", "Rugby", "strain"),
  t("running", "Running", "strain", "run"),
  t("sauna", "Sauna", "recovery"),
  t("skiing", "Skiing", "strain"),
  t("soccer", "Soccer", "strain", "run"),
  t("spin", "Spin", "strain", "ride"),
  t("squash", "Squash", "strain"),
  t("stairmaster", "Stairmaster", "strain"),
  t("stretching", "Stretching", "recovery"),
  t("swimming", "Swimming", "strain"),
  t("table_tennis", "Table tennis", "strain"),
  t("tennis", "Tennis", "strain"),
  t("walking", "Walking", "strain", "walk"),
  t("weightlifting", "Weightlifting", "strain", "strength"),
  t("yoga", "Yoga", "recovery"),
]

const BY_KEY = new Map(ACTIVITY_TYPES.map((a) => [a.key, a]))
export const activityType = (key: string) => BY_KEY.get(key)
