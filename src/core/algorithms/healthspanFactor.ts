// The line under each Healthspan factor (spec §11 R43): where the factor stands for long-term health, from the years it
// adds to or takes off Pulse Age. See docs/algorithms/healthspan.md, "Factor copy".

/** Years either side of zero that count as "on track" (*tunable*). */
export const ON_TRACK_YEARS = 0.3;

export type FactorState = "outperforming" | "on_track" | "underperforming";

export function factorState(years: number): FactorState {
  if (years <= -ON_TRACK_YEARS) return "outperforming";
  if (years >= ON_TRACK_YEARS) return "underperforming";
  return "on_track";
}

/** The heading and sentence for a factor, `label` as the user reads it ("Hours of sleep"). */
export function factorCopy(label: string, years: number): { state: FactorState; title: string; body: string } {
  // "Hours of sleep" reads "hours of sleep" mid-sentence; an initialism ("VO2 max") keeps its capitals.
  const name = /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
  const state = factorState(years);
  if (state === "outperforming")
    return { state, title: "Outperforming", body: `You're boosting your long-term health with your ${name}. Keep it up to hold on to the benefit.` };
  if (state === "underperforming")
    return { state, title: "Room to improve", body: `Your ${name} is adding years to your Pulse Age. Moving it toward the target for your age would take them off.` };
  return { state, title: "On track", body: `Your ${name} is close to the target for your age. Small gains here add up over the years.` };
}
