// "How Pulse works" (More): one explainer per score, written from src/core and docs/algorithms. Every number here
// is the code's; when the code changes, change this file.
export type HowRow = { term: string; detail: string }
export type HowSection = { title: string; paragraphs?: string[]; rows?: HowRow[] }
export type ScoreDoc = {
  /** URL segment: /more/how-it-works/<slug>. */
  slug: string
  /** Display name, e.g. "Recovery", "Pulse Age". */
  name: string
  /** One short sentence (max ~70 characters) shown as the page intro and as a caption. */
  summary: string
  /** The in-app screen where the score lives, e.g. "/recovery", "/health/healthspan"; null if none. */
  href: string | null
  /** In this order: "What goes in", "How it is weighted", "What the bands mean", "Limits". Omit a section only if it truly does not apply (say so in Limits instead). */
  sections: HowSection[]
}
export const SCORE_DOCS: ScoreDoc[] = [
  {
    slug: "recovery",
    name: "Recovery",
    summary: "How ready your body is to take on strain today, from 0 to 100%.",
    href: "/recovery",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Pulse scores Recovery each morning from last night’s main sleep, comparing each vital with your own baseline: a running average of recent nights that leans on the last two weeks and clips extreme nights.",
        ],
        rows: [
          { term: "Heart rate variability", detail: "Fitbit’s nightly HRV, in ms. Higher is better." },
          { term: "Resting heart rate", detail: "Fitbit’s daily resting heart rate from Google, in bpm; the lowest 5-minute average during sleep only on a day Google has none. Lower is better." },
          { term: "Sleep performance", detail: "Last night’s Sleep Performance. 85% is neutral." },
          { term: "Respiratory rate", detail: "Breaths per minute asleep, in rpm. Higher counts against you." },
          { term: "Skin temperature", detail: "Distance from Google’s skin-temperature baseline (your 30-night median), in °C; Pulse’s own baseline only when Google gives none. Either direction counts against you." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each input is measured in units of your usual night-to-night swing from baseline. Sleep moves one unit per 12\u00a0points away from 85%, skin temperature one unit per 1\u00a0°C. A missing input’s weight is shared among the rest.",
        ],
        rows: [
          { term: "HRV", detail: "55%" },
          { term: "Resting heart rate", detail: "20%" },
          { term: "Sleep performance", detail: "15%" },
          { term: "Respiratory rate", detail: "5%" },
          { term: "Skin temperature", detail: "5%" },
        ],
      },
      {
        title: "What the bands mean",
        paragraphs: [
          "The weighted average goes through an S-shaped curve (slope 1.6). Every input at baseline lands at about 58%; a quarter of a swing above reaches green, 0.6 below drops into red.",
        ],
        rows: [
          { term: "67-100%", detail: "Green: your body is primed for strain." },
          { term: "34-66%", detail: "Yellow: you are maintaining; moderate strain fits." },
          { term: "0-33%", detail: "Red: your body needs rest." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Recovery needs 7\u00a0nights of HRV before the first score and is Provisional until 14. The other vitals join once each has 4\u00a0nights of baseline. A night Fitbit could not stage has no HRV, so it gets no score rather than a guess, and after more than 14\u00a0nights without HRV the first night back is not scored. Recovery is an estimate from a wrist sensor: it reads your body, not your plans or how you feel.",
        ],
      },
    ],
  },
  {
    slug: "strain",
    name: "Strain",
    summary: "The cardiovascular load of your day, on a scale from 0 to 21.",
    href: "/strain",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Heart rate", detail: "Every reading from local midnight to midnight, sleep included. Each reading covers the gap to the next one, up to 2\u00a0minutes." },
          { term: "Resting heart rate", detail: "Fitbit’s daily value from Google, else last night’s sleeping resting heart rate, else 60\u00a0bpm." },
          { term: "Max heart rate", detail: "The value in Settings; else 208 − 0.7 × your age." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each minute earns points by how hard your heart works, as a share of your heart-rate reserve: the gap between your resting and max heart rate.",
        ],
        rows: [
          { term: "Below 50%", detail: "0\u00a0points a minute" },
          { term: "50-59%", detail: "1\u00a0point a minute" },
          { term: "60-69%", detail: "2\u00a0points a minute" },
          { term: "70-79%", detail: "3\u00a0points a minute" },
          { term: "80-89%", detail: "4\u00a0points a minute" },
          { term: "90% and up", detail: "5\u00a0points a minute" },
        ],
      },
      {
        title: "What the bands mean",
        paragraphs: [
          "The day’s points go on a log scale: Strain = 21 × ln(points + 1) ÷ ln(7,201), where 7,201 is a whole day at 5\u00a0points a minute, plus one. An hour at 70-79% with nothing else gives about 12.3. Doubling your points adds only about 1.6, so each point of Strain is harder to earn than the last.",
        ],
        rows: [
          { term: "0-9.9", detail: "Light" },
          { term: "10.0-13.9", detail: "Moderate" },
          { term: "14.0-17.9", detail: "Strenuous" },
          { term: "18.0-21.0", detail: "All out" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Strain needs at least 600 heart-rate readings, or 20 spread over at least 10\u00a0minutes; otherwise the day shows Not enough data. Today’s Strain is a running total until midnight. Each activity also gets its own Strain from the heart rate during it.",
          "Heart rate misses effort that barely raises it, such as heavy lifting with long rests. The zone chart and Strain use the same five zones on your heart-rate reserve (max minus resting heart rate): Zone 1 starts at resting + 50% of the reserve, then 60, 70, 80 and 90%. Below Zone 1 is not counted as a zone.",
        ],
      },
    ],
  },
  {
    slug: "strain-target",
    name: "Strain Target",
    summary: "A Strain range for today, set by your Recovery and recent load.",
    href: "/strain",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Today’s Recovery", detail: "Picks the band. Without a Recovery score there is no target." },
          { term: "Your last 28\u00a0days of Strain", detail: "The average of the days with Strain, today not included, is your base." },
          { term: "Training load (ACWR)", detail: "Your last 7\u00a0days of Strain against your last 28, up to yesterday." },
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Green Recovery", detail: "Base × 1.0 to base × 1.25" },
          { term: "Yellow Recovery", detail: "Base × 0.8 to base × 1.0" },
          { term: "Red Recovery", detail: "Base × 0.5 to base × 0.75" },
        ],
        paragraphs: [
          "If your training load is above 1.3, the top of the range is capped at your base, since load is already climbing fast. Below 0.8, both ends rise by 10%. The range is then kept between 4 and 19 and at least 2 wide; a range that is too narrow widens downwards. A base of 12 on a green day gives 12.0 - 15.0.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Below the range", detail: "A lighter day than your body can take today." },
          { term: "Inside the range", detail: "Training builds fitness without digging a recovery hole." },
          { term: "Above the range", detail: "More strain than today’s Recovery suggests; expect it to show tomorrow." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "With fewer than 14\u00a0days of Strain in the last 28, Pulse uses a starting range for your band, marked as an estimate: green 14.0 - 18.0, yellow 10.0 - 14.0, red 6.0 - 10.0. The target does not know your training plan, races or injuries. It is a guide, not a prescription.",
        ],
      },
    ],
  },
  {
    slug: "sleep",
    name: "Sleep Performance",
    summary: "How well last night’s sleep met your need, from 0 to 100%.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Hours asleep", detail: "Your main sleep against your sleep need. Naps are not counted here." },
          { term: "Sleep efficiency", detail: "Time asleep as a share of time in bed." },
          { term: "Restorative sleep", detail: "Deep and REM sleep as a share of time asleep." },
          { term: "Sleep consistency", detail: "Your Sleep Regularity over the last 7\u00a0days." },
        ],
        paragraphs: [
          "Your sleep need is the upper quartile of your last 28\u00a0nights, at least 8\u00a0hours (9 under 18) and at most 9.5. Until you have 7\u00a0nights, it is 8\u00a0hours.",
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Hours vs. need, 50%", detail: "Full marks at 100% of your need." },
          { term: "Efficiency, 20%", detail: "Scored as the percentage itself." },
          { term: "Restorative, 20%", detail: "Full marks when deep plus REM reach 50% of your sleep and deep alone reaches 13%. Less deep sleep scales this part down, to half at none." },
          { term: "Consistency, 10%", detail: "Scored as the consistency percentage." },
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "85-100%", detail: "Optimal" },
          { term: "70-84%", detail: "Sufficient" },
          { term: "0-69%", detail: "Poor" },
        ],
        paragraphs: [
          "The key statistics use their own marks for optimal and sufficient: hours vs. needed 85% and 70%, efficiency 85% and 75%, restorative 40% and 30%, consistency 80% and 70%.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Sleep Performance scores the main sleep only, once Fitbit has processed it. A night without deep and REM totals scores its restorative part as zero, so it reads lower. Without a consistency reading, that part counts as 50%. Sleep stages come from a wrist sensor and are an estimate.",
        ],
      },
    ],
  },
  {
    slug: "sleep-planner",
    name: "Sleep Planner",
    summary: "Tonight’s sleep need, and the bedtimes that meet it.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Your sleep need", detail: "The upper quartile of your last 28\u00a0nights, between 8 and 9.5\u00a0hours." },
          { term: "Today’s Strain", detail: "Strain above your 28-day average adds to the need." },
          { term: "Sleep debt", detail: "What you owe from recent nights." },
          { term: "Naps", detail: "Today’s naps take time off tonight’s need." },
          { term: "Your last 14 main sleeps", detail: "Your usual wake time and sleep efficiency." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Tonight’s need = your sleep need + 3\u00a0minutes for each Strain point above your 28-day average + 20% of your sleep debt − today’s nap time.",
          "Sleep debt runs over your last 14\u00a0nights with sleep. Each night, debt becomes 55% of (need + the debt so far − sleep), with the previous day’s naps counted as sleep; anything under 10\u00a0minutes clears to zero.",
          "Bedtimes count back from your median wake time on recent weekday or weekend mornings, to match tomorrow, allowing for your median efficiency (90% until known). A need of 8\u00a0hours, a 07:00 wake and 90% efficiency give a Peak bedtime of 22:07.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Peak", detail: "100% of tonight’s need." },
          { term: "Perform", detail: "85% of tonight’s need." },
          { term: "Get by", detail: "70% of tonight’s need." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "The planner needs 7 main sleeps before it gives bedtimes. It assumes tomorrow looks like your recent mornings and cannot see alarms or plans. Strain and naps later today change tonight’s need. It is a guide, not a prescription.",
        ],
      },
    ],
  },
  {
    slug: "pulse-age",
    name: "Pulse Age",
    summary: "How old your body behaves, and how fast that is changing.",
    href: "/health/healthspan",
    sections: [
      {
        title: "What goes in",
        paragraphs: ["Nine habits and vitals, averaged over 6\u00a0months, each against a reference: a fit person of your age and sex."],
        rows: [
          { term: "VO2 max", detail: "From runs in the last 90\u00a0days, else Fitbit’s daily estimate at half weight. Reference: your age’s 75th percentile." },
          { term: "Resting heart rate", detail: "Fitbit’s daily value from Google. Reference 60\u00a0bpm." },
          { term: "Steps", detail: "Reference and cap: 10,000 a day under 60, 8,000 from 60." },
          { term: "Sleep hours", detail: "Reference 7.5\u00a0hours; 7 to 8\u00a0scores the same." },
          { term: "Sleep consistency", detail: "Reference 86.3." },
          { term: "Heart rate zones 1-3", detail: "Daily time at 50-80% of your heart-rate reserve. Reference 150\u00a0minutes a week." },
          { term: "Heart rate zones 4-5", detail: "Daily time at 80% of your heart-rate reserve and above. Reference 75\u00a0minutes a week." },
          { term: "Strength activity", detail: "Reference 40\u00a0minutes a week." },
          { term: "Lean body mass", detail: "Fat-free mass for your height. Needs weight, body fat and height." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each input maps to a change in mortality risk from a published study. The changes are added, shrunk by 25% for overlap, scaled up when inputs are missing, and turned into years on the rule that mortality risk doubles about every 8\u00a0years. A resting heart rate of 70\u00a0bpm, all else at reference, adds about 0.75\u00a0years.",
          "Pace of Aging repeats this for your last 30\u00a0days: 1 + (30-day years − 6-month years) ÷ 5.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Younger than your age", detail: "Your inputs beat the reference on balance." },
          { term: "Older than your age", detail: "They fall short. The reference is fit, so many people start here." },
          { term: "Pace below 1.0x", detail: "Your last 30\u00a0days look younger than your 6\u00a0months." },
          { term: "Pace above 1.0x", detail: "They look older. Pace runs from −1.0x to 3.0x." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Time in zones is counted by Pulse from your heart rate, on the same five zones as Strain. Pulse Age needs 5 of the 9 inputs, is Provisional until 20\u00a0days have data, stays within 15\u00a0years of your age and updates weekly. Pace of Aging is provisional until your data spans 6\u00a0months. Both rest on population studies, not a clinical test of your body.",
        ],
      },
    ],
  },
  {
    slug: "stress",
    name: "Stress Monitor",
    summary: "How far your heart rate sits above your calm level, from 0 to 3.",
    href: "/health/stress",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Minute heart rate", detail: "The average heart rate of each minute." },
          { term: "Steps", detail: "Only still minutes count: no steps in that minute or the 2 either side." },
          { term: "Workouts and sleep", detail: "Minutes inside them are left out." },
          { term: "Your calm baseline", detail: "Your resting daytime heart rate, from earlier days." },
        ],
        paragraphs: [
          "Each day’s calm heart rate is the 10th percentile of its hourly averages between 06:00 and 22:00, using hours with at least 15 still minutes. It feeds the next day’s baseline.",
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each still minute’s distance above your baseline is measured in your usual spread, never less than 3.76\u00a0bpm, and mapped onto 0 to 3 on an S-shaped curve. At your baseline it reads 0.3, 1.5 spreads above reads 1.5, and 3 spreads above reads 2.7. Today Pulse shows the latest scored minute; past days show the day’s average.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "0-0.9", detail: "Low: calm." },
          { term: "1.0-1.9", detail: "Medium: heart rate above your calm level." },
          { term: "2.0-3.0", detail: "High: well above your calm level while you are still." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Stress is Provisional until 4\u00a0days have set your baseline; until then it uses a fixed spread of 7.65\u00a0bpm, so 15\u00a0bpm above your calm level reads 2.0. It reads heart rate alone, so caffeine, heat, illness or recovering from exercise raise it too. It is not a measure of how you feel.",
        ],
      },
    ],
  },
  {
    slug: "energy-bank",
    name: "Energy Bank",
    summary: "An estimate of how much energy you have left today, 0 to 100%.",
    href: "/",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Recovery and Sleep Performance", detail: "Set the starting level when you wake." },
          { term: "Heart-rate load", detail: "Each minute’s heart-rate points, as in Strain." },
          { term: "Stress", detail: "High-stress minutes drain; calm, still minutes recharge." },
          { term: "Naps", detail: "Recharge." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: ["At wake you start at 60% of Recovery plus 40% of Sleep Performance: Recovery 70% and sleep 80% start you at 74%. Then, minute by minute until bedtime:"],
        rows: [
          { term: "Awake", detail: "−0.04 a minute, about 38 over 16\u00a0hours." },
          { term: "Heart-rate load", detail: "−0.08 a minute for each heart-rate point, 1 to 5. An hour at 70-79% of your reserve costs 14.4." },
          { term: "High stress", detail: "−0.08 a minute." },
          { term: "Low stress, still", detail: "+0.01 a minute." },
          { term: "Napping", detail: "+0.25 a minute, with no drain." },
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "67-100%", detail: "Plenty in reserve." },
          { term: "34-66%", detail: "Pace yourself." },
          { term: "0-33%", detail: "Running low." },
        ],
        paragraphs: ["The level stays between 0 and 100%. The three biggest drains are listed by name."],
      },
      {
        title: "Limits",
        paragraphs: [
          "Energy Bank needs today’s Recovery and last night’s main sleep; without them it shows no value, and it is Provisional while Recovery is. It is a model with tuned constants and no published validation, set so a typical day ends between 15% and 40%. It cannot see mental effort that leaves heart rate unchanged, food or caffeine. It is an estimate, not a measurement.",
        ],
      },
    ],
  },
  {
    slug: "health-monitor",
    name: "Health Monitor",
    summary: "Last night’s five vitals against your own normal ranges.",
    href: "/health/monitor",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Resting heart rate", detail: "Fitbit’s daily resting heart rate from Google, in bpm." },
          { term: "Heart rate variability", detail: "Fitbit’s nightly HRV, in ms." },
          { term: "Respiratory rate", detail: "Breaths per minute asleep, in rpm." },
          { term: "SpO2", detail: "Blood oxygen overnight, in %." },
          { term: "Skin temperature", detail: "Last night against Google’s skin-temperature baseline, in °C." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Resting heart rate and HRV use Google’s personal ranges when Google gives them, and skin temperature uses ± 2 of Google’s 30-night standard deviation around its baseline. Otherwise, and always for respiratory rate and SpO2, a normal range is your baseline ± 2 of your usual night-to-night swings, built from earlier nights only. Pulse’s narrowest ranges are about ±5\u00a0bpm, ±12.5\u00a0ms, ±1.25\u00a0rpm, ±1.25\u00a0points of SpO2 and ±0.75\u00a0°C. SpO2 is one-sided: below 95% is always low, and a high value is never flagged.",
          "The illness signal compares resting heart rate, HRV, skin temperature and respiratory rate with your 30\u00a0nights before. A vital fires at 2 standard deviations in the unwell direction and adds 22\u00a0points per extra deviation, up to 40. With at least 2 vitals firing, 25\u00a0points is mild and 50 is raised. If you logged alcohol, sauna or travel the day before, Pulse takes that as the likely cause instead.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Within range", detail: "Inside your normal range." },
          { term: "Elevated or Low", detail: "Outside it; the chip names the bound you crossed." },
          { term: "Below 95%", detail: "SpO2 under 95%, whatever your range." },
          { term: "Illness signal", detail: "Several vitals moved together, a pattern often seen early in illness." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "A range from Google is there as soon as Google sends one. Pulse’s own range needs 4 earlier nights and lapses after 14\u00a0nights without a value; without Google’s baseline, skin temperature needs Pulse’s own first, so it takes about 8\u00a0nights. The illness signal stays quiet until 14 of your last 30\u00a0nights have resting heart rate or HRV. A flagged vital is a prompt to notice, not a diagnosis.",
        ],
      },
    ],
  },
  {
    slug: "fitness",
    name: "Fitness level",
    summary: "Your VO2 max compared with people of your age and sex.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "VO2 max", detail: "Your latest run value from the last 90\u00a0days; otherwise Fitbit’s latest daily estimate, marked Provisional." },
          { term: "Age and sex", detail: "From your profile." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Pulse places your VO2 max in the FRIEND reference table (Kaminsky 2015): lab treadmill tests from 7,783 adults without heart disease, by sex and age decade. It reads between the published percentiles and keeps the result between the 5th and the 95th. Under 20 uses the 20-29 row; 80 and over uses 70-79. A man of 35 at 45.0\u00a0ml/kg/min sits just under the 60th percentile: Good.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "80th percentile and up", detail: "Superior" },
          { term: "60th-79th", detail: "Excellent" },
          { term: "40th-59th", detail: "Good" },
          { term: "20th-39th", detail: "Fair" },
          { term: "Below the 20th", detail: "Poor" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Fitbit’s VO2 max is an estimate, while the table is lab-measured, so treat the percentile as approximate. The 2015 table runs 1.5-4.6\u00a0ml/kg/min higher than its 2022 update, so you may place a little low. The same table’s 75th percentile is the VO2 max reference in Pulse Age.",
        ],
      },
    ],
  },
  {
    slug: "training-balance",
    name: "Training balance",
    summary: "Whether your recent strain is above or below what you are used to.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Your daily Strain. A day with the band worn but too little heart rate counts as 0; a day without the band is skipped. Today’s Strain so far counts toward today’s ratio.",
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Training load (ACWR) is your average Strain over the last 7\u00a0days with data, divided by your average over the last 28. 1.00 means this week matches your usual. Reports use the last day of the week or month that has a ratio; Fitness shows today’s.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Below 0.80", detail: "Undertrained (Detraining on Fitness): load dropped below your usual." },
          { term: "0.80-1.29", detail: "Balanced (Optimal): the usual sweet spot." },
          { term: "1.30-1.49", detail: "Overreaching (Pushing): load is rising faster than you are used to." },
          { term: "1.50 and up", detail: "Overreaching (High risk): load jumped well above your usual." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Training load needs 14\u00a0days of Strain; until there are 28, your usual is the average of the days you have. It compares you with yourself, so it says nothing about whether your usual load suits your goals. The 0.8-1.3 sweet spot comes from team-sport injury research (Gabbett 2016) and is a rule of thumb.",
        ],
      },
    ],
  },
  {
    slug: "journal-impact",
    name: "Behaviour insights",
    summary: "How each behaviour you log goes with your next day’s scores.",
    href: "/journal/insights",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Journal check-ins", detail: "Each behaviour you answered yes or no, over the last 90\u00a0days." },
          { term: "Next-day scores", detail: "The next morning’s Recovery and HRV, and that night’s Sleep Performance." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "For each behaviour, Pulse compares the days you answered yes with the days you answered no: the difference in average next-day score. HRV shows as the change in standard deviations from your baseline. To see how sure that difference is, Pulse resamples your days 1,000 times and keeps the middle 90% of the results.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Positive or negative", detail: "That whole 90% range sits above or below zero: a clear effect." },
          { term: "No clear effect", detail: "The range crosses zero." },
          { term: "Needs more data", detail: "Fewer than 5 yes days or 5 no days." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "This is an association, not proof of cause. It does not adjust for other behaviours or training, so a tag you tend to log on hard days can look harmful. About 1 in 10 behaviours with no real effect will still show a clear one by chance. Days without an answer are left out.",
        ],
      },
    ],
  },
  {
    slug: "sleep-consistency",
    name: "Sleep consistency",
    summary: "How closely your sleep and wake times repeat from day to day.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Sleep sessions", detail: "Main sleeps and naps, minute by minute." },
          { term: "Band wear", detail: "A day counts only if the band recorded heart rate for at least half of it." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Pulse splits the last 7 noon-to-noon days into minutes, each asleep or awake, and checks each minute against the same minute the next day. The Sleep Regularity Index (Phillips 2017) is −100 + 200 × the share that match: 100 means an identical schedule, around 0 a random one. Pulse shows it from 0 to 100%, with anything below zero as 0%. A 1-hour nap lowers it by about 3\u00a0points.",
          "It makes up 10% of Sleep Performance and is one of the inputs to Pulse Age.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "80-100%", detail: "Optimal" },
          { term: "70-79%", detail: "Sufficient" },
          { term: "0-69%", detail: "Poor" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs 2 worn days in a row within the window; otherwise there is no value. Days without the band are skipped rather than counted as awake. Fitbit’s sleep sessions leave out brief wakes, so this reads somewhat higher than a lab measure. On the night the clocks change, times are compared 1\u00a0hour apart.",
        ],
      },
    ],
  },
  {
    slug: "training-load",
    name: "Fitness, fatigue and form",
    summary: "Your long-term and short-term training load, and the gap between them.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Your daily Strain, on Pulse’s internal 0-100 effort scale rather than 0 to 21. A day with the band worn but too little heart rate counts as 0.",
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Fitness", detail: "A rolling average of daily load that fades with a 42-day time constant." },
          { term: "Fatigue", detail: "The same with a 7-day time constant, so it reacts faster." },
          { term: "Form", detail: "Fitness minus Fatigue." },
        ],
        paragraphs: ["Both averages start from your mean load over the first 7\u00a0days."],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Form above 0", detail: "Your recent load is lighter than your longer-term load: you are fresher." },
          { term: "Form below 0", detail: "You are carrying fatigue from recent training." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs 14\u00a0days in a row with Strain data, and a day without the band starts the run again. It settles after about 42\u00a0days. Heart rate is its only input, so load that barely raises heart rate is missed.",
        ],
      },
    ],
  },
  {
    slug: "hr-recovery",
    name: "Heart rate recovery",
    summary: "How far your heart rate drops in the minute after a workout.",
    href: null,
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "End heart rate", detail: "The highest reading in the last 30\u00a0seconds of the activity." },
          { term: "One minute later", detail: "The median reading 45-75 seconds after the end, from at least 3\u00a0readings." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Heart rate recovery = end heart rate − heart rate one minute later, in bpm. It is measured only after a hard enough finish: at least 2\u00a0minutes in a row at 70% or more of your max heart rate within the last 5\u00a0minutes.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "20\u00a0bpm or more", detail: "Good" },
          { term: "12-19 bpm", detail: "Typical" },
          { term: "Below 12\u00a0bpm", detail: "Low" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs dense heart rate around the end of the activity, which Fitbit does not always record; otherwise it shows Not enough heart-rate data. Moving about in that first minute, or stopping the activity late, lowers the drop. Compare it across similar workouts, not between different sports.",
        ],
      },
    ],
  },
]
