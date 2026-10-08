/**
 * UI that matches the reference app but has no data source in Pulse yet. Each component is built and kept off
 * until its backend exists; turning a flag on is the only change needed to show it.
 */
export const FEATURES = {
  /** Record a workout live (type picker, map, live heart rate). Pulse imports workouts from Fitbit instead. */
  startActivity: false,
  /** Log a strength session exercise by exercise. */
  strengthTrainer: false,
  /** Share a live workout card. */
  liveShare: false,
  /** A multi-day coaching plan with progress. */
  myPlan: false,
  /** A smart alarm set from Pulse. Fitbit's alarms are not readable through Google Health. */
  sleepAlarm: false,
} as const
