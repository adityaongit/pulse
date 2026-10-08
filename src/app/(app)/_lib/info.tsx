// Info-sheet copy for the half-A screens (spec §7.2, §7.3, §7.5, §7.15). Final copy: do not reword. The three score sheets
// end with SOURCE_NOTE (user, 2026-10-04).
import type { InfoContent } from "@/components/shells/InfoButton"

function Rows({ rows }: { rows: [swatch: string | null, text: string][] }) {
  return (
    <ul className="space-y-2">
      {rows.map(([swatch, text]) => (
        <li key={text} className="flex items-baseline gap-2.5">
          {swatch && <span aria-hidden className={`size-2.5 shrink-0 translate-y-px rounded-sm ${swatch}`} />}
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}

/** Under each score's explainer: these are Pulse's own scores, not the reference app's (brand guidelines audit). */
const SOURCE_NOTE = <p className="text-[13px] leading-[18px] text-muted-foreground">Pulse scores, computed from your Fitbit data.</p>

export const RECOVERY_INFO: InfoContent = {
  title: "How Recovery works",
  body: (
    <>
      <p>
        Recovery shows how ready your body is to take on strain, from 0 to 100%. Pulse scores it each morning from last night’s heart rate
        variability, resting heart rate, respiratory rate, sleep performance and skin temperature, each compared with your own baseline.
      </p>
      <Rows
        rows={[
          ["bg-recovery-green", "Green, 67-100%: your body is primed for strain."],
          ["bg-recovery-yellow", "Yellow, 34-66%: you are maintaining; moderate strain fits."],
          ["bg-recovery-red", "Red, 0-33%: your body needs rest."],
        ]}
      />
      <p>
        Recovery needs 7&nbsp;nights of HRV before the first score and stays provisional until 14. A day without HRV or processed sleep gets no score
        rather than a guess.
      </p>
      {SOURCE_NOTE}
    </>
  ),
}

export const STRAIN_INFO: InfoContent = {
  title: "How Strain works",
  body: (
    <>
      <p>
        Strain measures the cardiovascular load of your day on a 0 to 21 scale, from the time you spend at higher heart rates. The scale is
        non-linear: each point is harder to earn than the last.
      </p>
      <Rows
        rows={[
          [null, "Light: up to 10.0"],
          [null, "Moderate: 10.1 - 14.0"],
          [null, "Strenuous: 14.1 - 18.0"],
          [null, "All Out: 18.1 - 21"],
        ]}
      />
      <p>
        Your Strain Target is a range for today, set from your Recovery and your recent training load. Today’s Strain is a running total
        until midnight.
      </p>
      {SOURCE_NOTE}
    </>
  ),
}

export const STRAIN_TARGET_INFO: InfoContent = {
  title: "Strain Target",
  body: (
    <p>
      Your Strain Target is a range for today, set from your Recovery and your training load over the last 28&nbsp;days. Inside it, training builds
      fitness without digging a recovery hole.
    </p>
  ),
}

export const CALORIES_INFO: InfoContent = {
  title: "Calories burned",
  body: (
    <>
      <p>
        Each bar is the day’s total from Google Health, split into what you burned by moving and what your body burned at rest. Today’s bar is a
        running total until midnight.
      </p>
      <Rows
        rows={[
          ["bg-energy-active", "Active: walking, workouts and other movement."],
          ["bg-energy-resting", "Resting: the rest of the total, your body’s baseline burn."],
          ["border border-dashed border-muted-foreground", "Dashed: a day with a total but no active figure, so Pulse shows no split."],
        ]}
      />
    </>
  ),
}

export const SLEEP_INFO: InfoContent = {
  title: "How Sleep works",
  body: (
    <>
      <p>
        Sleep Performance compares the sleep you got with the sleep you needed, adjusted for consistency, efficiency and restorative sleep. Your
        need is your personal baseline: the upper quartile of your last 28&nbsp;nights, between 8 and 9.5&nbsp;hours. Strain, sleep debt and naps change
        tonight’s need in the sleep planner, not this score.
      </p>
      <p>
        Sleep consistency is the Sleep Regularity Index: how closely your sleep and wake times match from one day to the next, over the last 7
        days.
      </p>
      {SOURCE_NOTE}
    </>
  ),
}

export const TONIGHT_INFO: InfoContent = {
  title: "Tonight’s sleep",
  body: (
    <p>
      Bedtimes are worked back from your typical wake time and how efficiently you sleep. Peak gets you 100% of tonight’s need, Perform 85%,
      Get by 70%.
    </p>
  ),
}

export const ENERGY_INFO: InfoContent = {
  title: "Energy Bank",
  body: (
    <>
      <p>
        Energy Bank estimates how much energy you have left today, from 0 to 100. It starts each morning from your Recovery and Sleep, drains
        with exertion and stressful stretches, and recharges during calm, still periods and naps. It is an estimate, not a measurement.
      </p>
      <Rows
        rows={[
          ["bg-recovery-green", "67-100: plenty in reserve."],
          ["bg-recovery-yellow", "34-66: pace yourself."],
          ["bg-recovery-red", "0-33: running low."],
        ]}
      />
    </>
  ),
}

export const STRAIN_RECOVERY_INFO: InfoContent = {
  title: "Strain & recovery",
  body: (
    <>
      <p>Your last 7&nbsp;days side by side: Day Strain in blue on the left scale, from 0 to 21, and Recovery on the right scale, from 0 to 100%.</p>
      <p>High strain on one day often shows up as lower Recovery the next morning. Days without a score are left as gaps.</p>
    </>
  ),
}

/** "Add activity" (Home's card button and the "+" menu): Pulse imports workouts, so this explains where they come from (§11 R2). */
export const ADD_ACTIVITY_INFO: InfoContent = {
  title: "Add an activity",
  body: (
    <>
      <p>Pulse reads your workouts from Fitbit through Google Health, so it cannot add one here.</p>
      <p>Start or log the workout in the Fitbit app. It appears in your activities after the next sync, with its Strain.</p>
    </>
  ),
}
