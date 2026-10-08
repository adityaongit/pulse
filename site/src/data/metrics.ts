// One page per metric under /metrics/<slug>/. The method text is the app's own "How Pulse works" content
// (src/app/(app)/more/how-it-works/content.ts), so the site and the app say the same thing and every number is
// the code's. This file adds what only the site needs: a URL slug, SEO copy, a band scale, an app screen,
// sources and related links. A new entry in SCORE_DOCS gets a page with sensible defaults and no edit here.
import { SCORE_DOCS, type ScoreDoc } from "../../../src/app/(app)/more/how-it-works/content"

export type Source = { label: string; url?: string }
export type Band = { from: number; to: number; label: string; color: string }
export type Scale = { min: number; max: number; unit?: string; bands: Band[] }
export type Shot = `${"phone" | "laptop"}-${"home" | "recovery" | "strain" | "sleep" | "health" | "health-monitor" | "journal" | "trends" | "dashboard-editor" | "stress" | "healthspan" | "reports" | "coach"}`
export type Faq = { q: string; a: string }

type Meta = {
  /** URL segment, if it should differ from the app's slug. */
  slug?: string
  /** <title>, about 60 characters. */
  title?: string
  /** Meta description, about 150 characters. */
  description?: string
  /** Search phrases this page answers: the keyword plan and the page's meta keywords. Generic terms only, no brands. */
  keywords?: string[]
  scale?: Scale
  shot?: Shot
  sources?: Source[]
  /** App slugs (or site slugs of the extra docs) of related metrics. */
  related?: string[]
  faq?: Faq[]
}

export type Metric = ScoreDoc & Required<Pick<Meta, "slug" | "title" | "description" | "keywords">> & Omit<Meta, "slug" | "title" | "description" | "keywords"> & { appSlug: string }

const C = {
  green: "var(--recovery-green)",
  yellow: "var(--recovery-yellow)",
  red: "var(--recovery-red)",
  strain: "var(--strain)",
  strainText: "var(--strain-text)",
  strainDeep: "var(--strain-deep)",
  sleep: "var(--sleep)",
  sleepDeep: "var(--sleep-deep)",
  optimal: "var(--optimal)",
  warning: "var(--warning)",
  stressLow: "var(--stress-low)",
  stressMedium: "var(--stress-medium)",
  stressHigh: "var(--stress-high)",
  muted: "#5a5e61",
}

const recoveryScale: Scale = {
  min: 0,
  max: 100,
  unit: "%",
  bands: [
    { from: 0, to: 33, label: "Red", color: C.red },
    { from: 34, to: 66, label: "Yellow", color: C.yellow },
    { from: 67, to: 100, label: "Green", color: C.green },
  ],
}

// Papers and projects cited more than once.
const S = {
  noop: { label: "noop: the open-source analytics engine Pulse's recovery, strain and sleep scoring is ported from", url: "https://github.com/ryanbr/noop" },
  plews2013: {
    label: "Plews DJ, et al. Training adaptation and heart rate variability in elite endurance athletes. Sports Med 2013;43:773-81",
    url: "https://doi.org/10.1007/s40279-013-0071-8",
  },
  buchheit2014: {
    label: "Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol 2014;5:73",
    url: "https://doi.org/10.3389/fphys.2014.00073",
  },
  altini2021: {
    label: "Altini M, Plews D. What is behind changes in resting heart rate and heart rate variability? Sensors 2021;21(23):7932",
    url: "https://doi.org/10.3390/s21237932",
  },
  edwards: { label: "Edwards S. The Heart Rate Monitor Book. 1993 (heart-rate zone weights)", url: "https://search.worldcat.org/search?q=Edwards+The+Heart+Rate+Monitor+Book+1993" },
  gabbett2016: {
    label: "Gabbett TJ. The training-injury prevention paradox. Br J Sports Med 2016;50(5):273-80",
    url: "https://doi.org/10.1136/bjsports-2015-095788",
  },
  impellizzeri2020: {
    label: "Impellizzeri FM, et al. Acute:Chronic Workload Ratio: conceptual issues and fundamental pitfalls. Int J Sports Physiol Perform 2020;15(6):907-13",
    url: "https://doi.org/10.1123/ijspp.2019-0864",
  },
  phillips2017: {
    label: "Phillips AJK, et al. Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep 2017;7:3216",
    url: "https://doi.org/10.1038/s41598-017-03171-4",
  },
  windred2024: {
    label: "Windred DP, et al. Sleep regularity is a stronger predictor of mortality risk than sleep duration. Sleep 2024;47(1):zsad253",
    url: "https://doi.org/10.1093/sleep/zsad253",
  },
  kaminsky2015: {
    label: "Kaminsky LA, Arena R, Myers J. Reference standards for cardiorespiratory fitness (FRIEND). Mayo Clin Proc 2015;90(11):1515-23",
    url: "https://doi.org/10.1016/j.mayocp.2015.07.026",
  },
  zhang2016: {
    label: "Zhang D, Shen X, Qi X. Resting heart rate and all-cause and cardiovascular mortality in the general population: a meta-analysis. CMAJ 2016;188(3):E53-63",
    url: "https://doi.org/10.1503/cmaj.150535",
  },
  googleHealthApi: { label: "Google Health API reference: data points and field definitions", url: "https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints" },
}

const META: Record<string, Meta> = {
  recovery: {
    title: "Recovery score for Fitbit Air: how Pulse works it out",
    description: "Pulse turns Fitbit Air HRV, resting heart rate, sleep, breathing and skin temperature into a 0-100% Recovery score. The inputs, weights and limits.",
    keywords: ["fitbit air recovery score", "recovery score explained", "how is recovery score calculated", "hrv recovery score"],
    scale: recoveryScale,
    shot: "phone-recovery",
    sources: [S.noop, S.plews2013, S.buchheit2014, S.altini2021],
    related: ["hrv", "resting-heart-rate", "sleep", "strain-target"],
    faq: [
      {
        q: "Does the Fitbit Air have a recovery score?",
        a: "Google's app gives Fitbit Air owners a Readiness-style score. Pulse adds a recovery-app-style 0-100% Recovery computed on your own server from the band's nightly HRV, resting heart rate, sleep, respiratory rate and skin temperature.",
      },
      {
        q: "What is a good Recovery score?",
        a: "67% and above is green, 34-66% yellow and 33% or below red. Every input sitting exactly at your own baseline lands at about 58%, so a typical night reads yellow.",
      },
      {
        q: "Why is there no Recovery score for my first week?",
        a: "Recovery compares each vital with your own baseline. It needs 7 nights of HRV for the first score and is marked Provisional until 14.",
      },
    ],
  },
  strain: {
    title: "Strain score from heart rate: the 0-21 scale explained",
    description: "How Pulse scores a day's cardiovascular load on a 0-21 Strain scale from Fitbit Air heart rate, heart-rate reserve zones and a log curve.",
    keywords: ["strain score explained", "strain 0-21 scale", "fitbit air strain", "cardio load score"],
    scale: {
      min: 0,
      max: 21,
      bands: [
        { from: 0, to: 9.9, label: "Light", color: C.strainDeep },
        { from: 10, to: 13.9, label: "Moderate", color: C.strain },
        { from: 14, to: 17.9, label: "Strenuous", color: C.strainText },
        { from: 18, to: 21, label: "All out", color: "#8fd0ff" },
      ],
    },
    shot: "laptop-strain",
    sources: [S.noop, S.edwards],
    related: ["strain-target", "training-balance", "training-load", "energy-bank"],
    faq: [
      {
        q: "Why is Strain on a 0-21 scale?",
        a: "Pulse uses the familiar 0-21 range, so the numbers read naturally. The day's heart-rate points go on a log curve, so each extra point of Strain takes more effort than the last.",
      },
      {
        q: "Why does weightlifting give me low Strain?",
        a: "Strain reads heart rate only. Effort that barely raises heart rate, such as heavy sets with long rests, earns few points.",
      },
    ],
  },
  "strain-target": {
    title: "Strain Target: a daily training range from your Recovery",
    description: "Pulse sets today's Strain range from your Recovery band and 28-day load, then caps fast ramp-ups with the acute:chronic workload ratio.",
    keywords: ["how much should i train today", "strain target", "daily strain goal"],
    shot: "phone-strain",
    sources: [S.gabbett2016, S.noop],
    related: ["strain", "recovery", "training-balance"],
  },
  sleep: {
    slug: "sleep-performance",
    title: "Sleep Performance score: hours, efficiency and consistency",
    description: "How Pulse scores last night's sleep from 0-100% against your personal sleep need, using Fitbit Air sleep stages, efficiency and sleep regularity.",
    keywords: ["sleep performance score", "fitbit air sleep score", "how much sleep do i need"],
    scale: {
      min: 0,
      max: 100,
      unit: "%",
      bands: [
        { from: 0, to: 69, label: "Poor", color: C.sleepDeep },
        { from: 70, to: 84, label: "Sufficient", color: C.sleep },
        { from: 85, to: 100, label: "Optimal", color: "#a6c3d7" },
      ],
    },
    shot: "phone-sleep",
    sources: [S.noop, S.phillips2017],
    related: ["sleep-planner", "sleep-consistency", "recovery"],
  },
  "sleep-planner": {
    title: "Sleep Planner: tonight's sleep need and bedtime",
    description: "Pulse works out tonight's sleep need from your history, today's Strain, sleep debt and naps, then counts back from your usual wake time.",
    keywords: ["what time should i go to bed", "sleep need calculator", "sleep debt"],
    shot: "laptop-sleep",
    sources: [S.noop],
    related: ["sleep", "sleep-consistency", "strain"],
  },
  "pulse-age": {
    title: "Pulse Age: a biological age estimate from your wearable",
    description: "Pulse Age estimates how old your body behaves from nine habits and vitals, using published mortality studies. How it works, and what it cannot tell you.",
    keywords: ["biological age from wearable", "biological age without a subscription", "pace of aging", "fitbit biological age"],
    shot: "phone-health",
    sources: [
      {
        label: "Kodama S, et al. Cardiorespiratory fitness as a quantitative predictor of all-cause mortality. JAMA 2009;301(19):2024-35",
        url: "https://doi.org/10.1001/jama.2009.681",
      },
      S.zhang2016,
      { label: "Paluch AE, et al. Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts. Lancet Public Health 2022;7(3):e219-28", url: "https://doi.org/10.1016/S2468-2667(21)00302-9" },
      { label: "Cappuccio FP, et al. Sleep duration and all-cause mortality: a systematic review and meta-analysis. Sleep 2010;33(5):585-92", url: "https://doi.org/10.1093/sleep/33.5.585" },
      S.windred2024,
      { label: "Ekelund U, et al. Dose-response associations between accelerometry measured physical activity and all cause mortality. BMJ 2019;366:l4570", url: "https://doi.org/10.1136/bmj.l4570" },
      { label: "Lee DH, et al. Long-term leisure-time physical activity intensity and all-cause and cause-specific mortality. Circulation 2022;146(7):523-34", url: "https://doi.org/10.1161/CIRCULATIONAHA.121.058162" },
      { label: "Momma H, et al. Muscle-strengthening activities are associated with lower risk and mortality in major non-communicable diseases. Br J Sports Med 2022;56(13):755-63", url: "https://doi.org/10.1136/bjsports-2021-105061" },
      { label: "Sedlmeier AM, et al. Relation of body fat mass and fat-free mass to total mortality. Am J Clin Nutr 2021;113(3):639-46", url: "https://doi.org/10.1093/ajcn/nqaa339" },
      { label: "Finch CE, Pike MC, Witten M. Slow mortality rate accelerations during aging in some animals approximate that of humans. Science 1990;249(4971):902-5", url: "https://doi.org/10.1126/science.2392680" },
      S.kaminsky2015,
      { label: "Bull FC, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med 2020;54(24):1451-62", url: "https://doi.org/10.1136/bjsports-2020-102955" },
      S.noop,
    ],
    related: ["fitness", "sleep-consistency", "resting-heart-rate"],
    faq: [
      {
        q: "Is Pulse Age my real biological age?",
        a: "No. It is an estimate built from population studies that link habits and vitals with mortality risk. It is not a clinical test of your body, and the app labels it as an estimate.",
      },
      {
        q: "Why is my Pulse Age older than my real age?",
        a: "The reference is a fit person of your age and sex, not an average one, so many people start older than their age. Steps, VO2 max and time in heart-rate zones usually move it most.",
      },
    ],
  },
  stress: {
    slug: "stress-monitor",
    title: "Stress Monitor: a 0-3 stress score from heart rate",
    description: "Pulse scores each still, awake minute from 0 to 3 by how far your heart rate sits above your calm daytime level. Inputs, curve and limits.",
    keywords: ["stress score from heart rate", "stress monitor without a subscription", "fitbit air stress"],
    scale: {
      min: 0,
      max: 3,
      bands: [
        { from: 0, to: 0.9, label: "Low", color: C.stressLow },
        { from: 1, to: 1.9, label: "Medium", color: C.stressMedium },
        { from: 2, to: 3, label: "High", color: C.stressHigh },
      ],
    },
    shot: "phone-home",
    sources: [S.noop],
    related: ["energy-bank", "resting-heart-rate", "health-monitor"],
  },
  "energy-bank": {
    title: "Energy Bank: an estimate of energy left in your day",
    description: "Pulse's Energy Bank starts from Recovery and sleep, then spends and recharges minute by minute from heart-rate load, stress and naps.",
    keywords: ["energy bank", "daily energy score", "energy level from heart rate"],
    scale: recoveryScale,
    shot: "laptop-home",
    sources: [S.edwards],
    related: ["recovery", "stress", "strain"],
  },
  "health-monitor": {
    title: "Health Monitor: nightly vitals against your normal range",
    description: "Pulse checks last night's resting heart rate, HRV, respiratory rate, SpO2 and skin temperature against your own ranges, and flags an illness pattern.",
    keywords: ["fitbit air health metrics", "spo2 skin temperature fitbit", "illness detection wearable"],
    shot: "laptop-health-monitor",
    sources: [
      S.noop,
      { label: "Mishra T, et al. Pre-symptomatic detection of COVID-19 from smartwatch data. Nat Biomed Eng 2020;4:1208-20", url: "https://doi.org/10.1038/s41551-020-00640-6" },
      { label: "Natarajan A, Su HW, Heneghan C. Assessment of physiological signs associated with COVID-19 measured using wearable devices. npj Digit Med 2020;3:156", url: "https://doi.org/10.1038/s41746-020-00363-7" },
    ],
    related: ["hrv", "resting-heart-rate", "recovery"],
  },
  fitness: {
    slug: "fitness-level",
    title: "Fitness level: your VO2 max percentile by age and sex",
    description: "Pulse places your Fitbit VO2 max among lab-measured adults of your age and sex (FRIEND registry) and gives a percentile and a category.",
    keywords: ["vo2 max percentile", "is my vo2 max good", "fitbit cardio fitness score"],
    scale: {
      min: 0,
      max: 100,
      unit: "th",
      bands: [
        { from: 0, to: 19, label: "Poor", color: C.muted },
        { from: 20, to: 39, label: "Fair", color: C.sleepDeep },
        { from: 40, to: 59, label: "Good", color: C.sleep },
        { from: 60, to: 79, label: "Excellent", color: C.strainText },
        { from: 80, to: 100, label: "Superior", color: C.optimal },
      ],
    },
    shot: "laptop-health",
    sources: [
      S.kaminsky2015,
      { label: "Kaminsky LA, et al. Updated reference standards for cardiorespiratory fitness (FRIEND). Mayo Clin Proc 2022;97(2):285-93", url: "https://doi.org/10.1016/j.mayocp.2021.08.020" },
    ],
    related: ["pulse-age", "training-load", "hr-recovery"],
  },
  "training-balance": {
    title: "Training balance: acute:chronic workload ratio (ACWR)",
    description: "Pulse compares your last 7 days of Strain with your last 28 to show whether your load is balanced, rising fast or dropping off.",
    keywords: ["acute chronic workload ratio", "acwr calculator", "am i overtraining"],
    shot: "laptop-trends",
    scale: {
      min: 0,
      max: 2,
      bands: [
        { from: 0, to: 0.79, label: "Undertrained", color: C.sleep },
        { from: 0.8, to: 1.29, label: "Balanced", color: C.optimal },
        { from: 1.3, to: 1.49, label: "Pushing", color: C.warning },
        { from: 1.5, to: 2, label: "High risk", color: C.red },
      ],
    },
    sources: [S.gabbett2016, S.impellizzeri2020, S.noop],
    related: ["training-load", "strain", "strain-target"],
  },
  "journal-impact": {
    slug: "behaviour-insights",
    title: "Behaviour insights: how habits go with next-day scores",
    description: "Pulse compares days you logged a behaviour with days you did not, and shows the difference in next-day Recovery, HRV and sleep with a bootstrap interval.",
    keywords: ["does alcohol affect hrv", "habit journal for recovery", "habit tracking recovery"],
    shot: "phone-journal",
    sources: [{ label: "Efron B, Tibshirani RJ. An Introduction to the Bootstrap. Chapman & Hall, 1993", url: "https://doi.org/10.1201/9780429246593" }],
    related: ["recovery", "hrv", "sleep"],
  },
  "sleep-consistency": {
    title: "Sleep consistency: the Sleep Regularity Index explained",
    description: "Pulse measures how closely your sleep and wake times repeat with the Sleep Regularity Index (SRI), minute by minute over 7 days.",
    keywords: ["sleep regularity index", "sleep consistency score", "sri sleep"],
    scale: {
      min: 0,
      max: 100,
      unit: "%",
      bands: [
        { from: 0, to: 69, label: "Poor", color: C.sleepDeep },
        { from: 70, to: 79, label: "Sufficient", color: C.sleep },
        { from: 80, to: 100, label: "Optimal", color: "#a6c3d7" },
      ],
    },
    shot: "laptop-sleep",
    sources: [S.phillips2017, S.windred2024],
    related: ["sleep", "sleep-planner", "pulse-age"],
  },
  "training-load": {
    slug: "fitness-fatigue-form",
    title: "Fitness, fatigue and form from daily Strain",
    description: "Pulse tracks long-term fitness, short-term fatigue and form (the gap between them) from your daily Strain with 42-day and 7-day averages.",
    keywords: ["fitness fatigue form", "training load chart", "ctl atl tsb"],
    sources: [
      { label: "Hellard P, et al. Assessing the limitations of the Banister model in monitoring training. J Sports Sci 2006;24(5):509-20", url: "https://doi.org/10.1080/02640410500244697" },
    ],
    related: ["training-balance", "strain", "fitness"],
  },
  "hr-recovery": {
    slug: "heart-rate-recovery",
    title: "Heart rate recovery: the one-minute drop after exercise",
    description: "How Pulse measures heart rate recovery after a hard workout from Fitbit Air heart rate, and what 12 and 20 bpm mean.",
    keywords: ["heart rate recovery", "what is a good heart rate recovery", "hrr one minute"],
    scale: {
      min: 0,
      max: 40,
      unit: " bpm",
      bands: [
        { from: 0, to: 11, label: "Low", color: C.muted },
        { from: 12, to: 19, label: "Typical", color: C.sleep },
        { from: 20, to: 40, label: "Good", color: C.optimal },
      ],
    },
    sources: [
      { label: "Cole CR, et al. Heart-rate recovery immediately after exercise as a predictor of mortality. N Engl J Med 1999;341(18):1351-7", url: "https://doi.org/10.1056/NEJM199910283411804" },
    ],
    related: ["fitness", "strain", "resting-heart-rate"],
  },
}

// Two inputs people search for on their own. They are not scores in the app, so they live here, in the same shape.
const EXTRA_DOCS: (ScoreDoc & Meta)[] = [
  {
    slug: "hrv",
    name: "Heart rate variability (HRV)",
    summary: "The night-to-night signal Recovery leans on most, read from your Fitbit Air.",
    href: "/health/monitor",
    title: "HRV on the Fitbit Air: what it is and how Pulse uses it",
    description: "Where Pulse gets your Fitbit Air HRV, why it compares HRV only with your own baseline, and how it drives Recovery and the Health Monitor.",
    keywords: ["fitbit air hrv", "what is a good hrv", "hrv baseline", "rmssd"],
    shot: "phone-health-monitor",
    sources: [S.googleHealthApi, S.plews2013, S.buchheit2014, S.altini2021],
    related: ["recovery", "resting-heart-rate", "health-monitor", "journal-impact"],
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Heart rate variability is the variation in time between heartbeats. Google Health reports a nightly average HRV for the main sleep, in milliseconds, computed as RMSSD (the root mean square of successive differences between beats). Pulse reads that value through the Google Health API; it does not compute HRV from raw beats.",
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Recovery", detail: "55% of the score, the largest single input." },
          { term: "Health Monitor", detail: "Checked against your normal range: your baseline ± 2 of your usual night-to-night swings." },
          { term: "Illness signal", detail: "A drop against your 30 nights before counts towards the combined illness pattern." },
          { term: "Behaviour insights", detail: "Shown as the change in standard deviations from your baseline after a logged behaviour." },
        ],
      },
      {
        title: "What the bands mean",
        paragraphs: [
          "There is no universal good HRV. It varies a lot between people with age, fitness and genetics, so Pulse never grades your HRV against other people. It compares tonight with your own baseline, a running average of recent nights that clips extreme values. Above your baseline is usually a good sign; a run of nights below it is worth noticing.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "A night that Fitbit could not stage has no HRV, so Recovery gets no score rather than a guess. HRV moves with alcohol, illness, late meals, heat and hard training, so one low night says little on its own; trends say more. A wrist sensor's HRV is an estimate and is not comparable with a chest strap's morning reading.",
        ],
      },
    ],
  },
  {
    slug: "resting-heart-rate",
    name: "Resting heart rate",
    summary: "Your lowest sleeping heart rate, and the vital most scores lean on.",
    href: "/health/monitor",
    title: "Resting heart rate on the Fitbit Air: how Pulse measures it",
    description: "How Pulse takes resting heart rate from Fitbit Air sleep data, and how it feeds Recovery, Strain, the Health Monitor and Pulse Age.",
    keywords: ["fitbit air resting heart rate", "sleeping heart rate", "what is a good resting heart rate"],
    shot: "laptop-health-monitor",
    sources: [S.zhang2016, S.altini2021, S.noop],
    related: ["hrv", "recovery", "pulse-age", "strain"],
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Sleeping resting heart rate", detail: "The lowest 5-minute average heart rate during the main sleep, in bpm. Recovery, Strain and the Health Monitor use this." },
          { term: "Google's daily resting heart rate", detail: "Google Health's own daily value. Pulse Age uses this one, and Strain falls back to it when there is no sleeping value." },
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Recovery", detail: "20% of the score. Lower than your baseline counts in your favour." },
          { term: "Strain", detail: "Sets the bottom of your heart-rate reserve, the range Strain zones are measured in." },
          { term: "Health Monitor", detail: "Checked against your own normal range, at least about ±5 bpm wide." },
          { term: "Pulse Age", detail: "Against a reference of 60 bpm. 70 bpm with everything else at reference adds about 0.75 years." },
        ],
      },
      {
        title: "What the bands mean",
        paragraphs: [
          "Day to day, Pulse reads resting heart rate against your own baseline: a few beats above it after a hard day, a late meal or alcohol is common. Over the long term, a lower resting heart rate goes with lower mortality in population studies (about 9% higher risk per 10 bpm in a 2016 meta-analysis), which is why it is one of Pulse Age's inputs.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "A minimum over many 5-minute windows reads a little lower on long nights, and optical sensors can drop out. A band worn loosely or missing a night leaves gaps. A raised value is a prompt to notice, not a diagnosis.",
        ],
      },
    ],
  },
]

function merge(doc: ScoreDoc & Meta): Metric {
  const meta = { ...doc, ...META[doc.slug] }
  return {
    ...meta,
    appSlug: doc.slug,
    slug: meta.slug ?? doc.slug,
    title: meta.title ?? `${doc.name}: how Pulse calculates it`,
    description: meta.description ?? doc.summary,
    keywords: meta.keywords ?? [doc.name.toLowerCase(), `${doc.name.toLowerCase()} fitbit air`],
  }
}

export const METRICS: Metric[] = [...SCORE_DOCS, ...EXTRA_DOCS].map(merge)

const byAppSlug = new Map(METRICS.map((m) => [m.appSlug, m]))
/** Related metrics, resolved to pages; unknown slugs are dropped. */
export function relatedOf(m: Metric): Metric[] {
  return (m.related ?? []).map((s) => byAppSlug.get(s)).filter((x): x is Metric => !!x)
}
export function metricPath(m: Metric) {
  return `/metrics/${m.slug}/`
}
export function metricByAppSlug(slug: string) {
  return byAppSlug.get(slug)
}
