// Info-sheet copy for the half-A screens (spec §7.2, §7.3, §7.5, §7.15). Final copy: do not reword.
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

export const RECOVERY_INFO: InfoContent = {
  title: "How Recovery works",
  body: (
    <>
      <p>
        Recovery shows how ready your body is to take on strain, from 0 to 100%. Pulse scores it each morning from last night&apos;s heart rate
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
        Recovery needs 7 nights of HRV before the first score and stays provisional until 14. A day without HRV or processed sleep gets no score
        rather than a guess.
      </p>
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
          [null, "Light: 0 - 9.9"],
          [null, "Moderate: 10 - 13.9"],
          [null, "Strenuous: 14 - 17.9"],
          [null, "All out: 18 - 21"],
        ]}
      />
      <p>
        Your Strain Target is a range for today, set from your Recovery and your recent training load. Today&apos;s Strain is a running total
        until midnight.
      </p>
    </>
  ),
}

export const STRAIN_TARGET_INFO: InfoContent = {
  title: "Strain Target",
  body: (
    <p>
      Your Strain Target is a range for today, set from your Recovery and your training load over the last 28 days. Inside it, training builds
      fitness without digging a recovery hole.
    </p>
  ),
}

export const SLEEP_INFO: InfoContent = {
  title: "How Sleep works",
  body: (
    <>
      <p>
        Sleep Performance compares the sleep you got with the sleep you needed, adjusted for consistency, efficiency and restorative sleep. Your
        need is your personal baseline plus extra for yesterday&apos;s strain and any sleep debt, minus naps.
      </p>
      <p>
        Sleep consistency is the Sleep Regularity Index: how closely your sleep and wake times match from one day to the next, over the last 7
        days.
      </p>
    </>
  ),
}

export const TONIGHT_INFO: InfoContent = {
  title: "Tonight's sleep",
  body: (
    <p>
      Bedtimes are worked back from your typical wake time and how efficiently you sleep. Peak gets you 100% of tonight&apos;s need, Perform 85%,
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
      <p>Your last 7 days side by side: Day Strain in blue on the left scale, from 0 to 21, and Recovery on the right scale, from 0 to 100%.</p>
      <p>High strain on one day often shows up as lower Recovery the next morning. Days without a score are left as gaps.</p>
    </>
  ),
}
