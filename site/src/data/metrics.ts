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
    title: "Recovery score from Google Health data: how it works",
    description: "Pulse turns Google Health HRV, resting heart rate, sleep, breathing and skin temperature into a 0-100% Recovery score. The inputs, weights and limits.",
    keywords: ["recovery score explained", "how is recovery score calculated", "hrv recovery score"],
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
    description: "How Pulse scores a day's cardiovascular load on a 0-21 Strain scale from your wearable's heart rate, heart-rate reserve zones and a log curve.",
    keywords: ["strain score explained", "strain 0-21 scale", "fitbit strain score", "cardio load score"],
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
    faq: [
      { q: "How much should I train today?", a: "Pulse gives you a Strain range for today, on the 0 to 21 scale. It starts from your average Strain over the last 28 days, then scales that by today's Recovery: green is 1.0 to 1.25 times the average, yellow 0.8 to 1.0, red 0.5 to 0.75. It is a guide to effort, not a plan, and it cannot see injuries, races or what you have scheduled." },
      { q: "How is this different from Google's Target Load?", a: "Target Load is a weekly range. On the free plan it follows your average Cardio Load over the previous four weeks, and on Premium a coach sets it. Pulse's Strain Target is a daily range that starts from today's Recovery, and Google does not share Target Load with other apps. See <a href=\"/blog/fitbit-target-load/\">Fitbit Target Load</a>." },
      { q: "Why does my target say 14.0 to 18.0 when I have barely trained?", a: "That is the starting range. With fewer than 14 days of Strain in the last 28, Pulse has no base of your own, so it uses a fixed range for your Recovery band and marks it as an estimate: green 14 to 18, yellow 10 to 14, red 6 to 10. Once you have 14 days of data, the range follows your own history." },
      { q: "Why is the top of my range lower than I expected?", a: "Probably because your <a href=\"/metrics/training-balance/\">training balance</a> is above 1.3, meaning the last week is already well over your 28-day average. Pulse then caps the top of the range at your base so today does not add to the climb. Below 0.8 the opposite happens and both ends rise by 10%." },
    ],
  },
  sleep: {
    slug: "sleep-performance",
    title: "Sleep Performance score: hours, efficiency and consistency",
    description: "How Pulse scores last night's sleep from 0-100% against your personal sleep need, using your wearable's sleep stages, efficiency and sleep regularity.",
    keywords: ["sleep performance score", "how much sleep do i need"],
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
    faq: [
      { q: "How much sleep do I need?", a: "Pulse does not use a fixed figure. Your sleep need is the upper quartile of your last 28 nights, which is the amount you manage on your better nights, held between 8 and 9.5 hours (9 to 9.5 under 18). Until it has 7 nights it uses 8 hours. It is a statistical estimate from your own habits, not a medical measurement, so a persistent need for much more sleep is worth raising with a doctor." },
      { q: "What is a good Sleep Performance score?", a: "In Pulse, 85% and above is Optimal, 70 to 84% is Sufficient, and below 70% is Poor. Hitting 100% needs enough hours, high efficiency, plenty of deep and REM sleep and a regular schedule on the same night, so most nights lose a few points somewhere. A run of scores in the 80s is a normal, healthy pattern. Judge the weekly trend, not a single night." },
      { q: "How is this different from Google Health's Sleep Score?", a: "Google's Sleep Score combines six parts: duration, time to sound sleep, sound sleep, restlessness, full awakenings and interruptions. It does not publish weights, and the Google Health API does not expose it, so Pulse cannot show it. Pulse computes its own score from four published parts, with 50% on hours against your personal need. The two numbers are not interchangeable. <a href=\"/blog/fitbit-sleep-score-explained/\">Fitbit sleep score explained</a> covers Google's version." },
      { q: "Why is my Sleep Performance low when I slept 8 hours?", a: "Hours are only half the score. Low efficiency, little deep or REM sleep, or an irregular week can each pull it down. A night with no stage data leaves the restorative part out and rescales the other parts. Your personal need can also sit above 8 hours. Stages come from a wrist sensor and are an estimate, so the restorative part is the least certain." },
    ],
  },
  "sleep-planner": {
    title: "Sleep Planner: tonight's sleep need and bedtime",
    description: "Pulse works out tonight's sleep need from your history, today's Strain, sleep debt and naps, then counts back from your usual wake time.",
    keywords: ["what time should i go to bed", "sleep need calculator", "sleep debt"],
    shot: "laptop-sleep",
    sources: [S.noop],
    related: ["sleep", "sleep-consistency", "strain"],
    faq: [
      { q: "What time should I go to bed?", a: "It depends on when you need to wake and how much sleep you need. Pulse takes your usual wake time for the coming morning, from your recent weekdays or weekends, then subtracts tonight's need divided by your typical sleep efficiency. For an 8-hour need, a 07:00 wake and 90% efficiency, that is 22:07. It cannot see alarms or plans, so check the wake time it assumes." },
      { q: "How does sleep debt work in the planner?", a: "Pulse runs a ledger over your last 14 nights with sleep. Each night, the debt becomes 55% of your need plus the debt so far, minus the sleep you got, with naps credited. Debt under 10 minutes clears to zero. Tonight's planner adds 20% of the current debt to your need, so a large debt is repaid over about five nights instead of in one long night." },
      { q: "How is this different from WHOOP's Sleep Planner?", a: "The idea is the same: a need built from a baseline, extra for strain and debt, less for naps, turned into bedtimes at 100%, 85% and 70% of the need. WHOOP does not publish its amounts. Pulse does: 3 minutes per Strain point above your 28-day average, 20% of debt, and a baseline from your own upper-quartile nights. See <a href=\"/blog/whoop-sleep-need-explained/\">WHOOP sleep need explained</a>." },
      { q: "Why does the planner show no bedtime?", a: "It needs 7 main sleeps in your history before it gives bedtimes, because the wake time and efficiency come from your recent nights. Until then it only has a default need of 8 hours. A very long nap can also bring tonight's need close to zero. The planner is a guide for scheduling, not a prescription." },
    ],
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
    keywords: ["stress score from heart rate", "stress monitor without a subscription"],
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
    keywords: ["google health vitals", "spo2 skin temperature fitbit", "illness detection wearable"],
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
    keywords: ["vo2 max percentile", "is my vo2 max good"],
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
    faq: [
      { q: "What is a good VO2 max for my age?", a: "In Pulse, Good starts at the 40th percentile for your age and sex and Superior at the 80th. For men aged 30 to 39 that means roughly 40 and 52 ml/kg/min, and for women aged 30 to 39 roughly 28 and 38. Those cut-offs come from the published lab table, which gives one set per decade of age." },
      { q: "Why is my percentile lower than I expected?", a: "Two reasons. The table behind it (Kaminsky 2015) runs 1.5 to 4.6 ml/kg/min higher than its 2022 update, so you may place a little low. And Fitbit's value is an estimate from your runs and heart rate, while the table is lab-measured. A device that reads a few points high or low moves the percentile by several places." },
      { q: "Why is my Fitbit VO2 max marked Provisional?", a: "Pulse prefers the latest run value from the last 90 days. With no run in that window it falls back to Fitbit's latest daily estimate and marks it Provisional. Google says an outdoor run of about 10 minutes helps produce a reading, so a few outdoor runs are the usual way to replace a provisional number. See <a href=\"/blog/fitbit-vo2-max-accuracy/\">Fitbit VO2 max accuracy</a>." },
      { q: "How is this different from Google Health's Cardio Fitness Score?", a: "The Cardio Fitness Score is Google's estimate of your VO2 max, and it also sorts you into Poor to Excellent using Google's own age and sex tables. Pulse uses that number as input and does not re-estimate it. It then places it among lab-measured adults and returns a percentile with five bands, so the two labels can disagree even when the VO2 max is the same." },
    ],
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
    faq: [
      { q: "How do I calculate my ACWR?", a: "Average your Strain over the last 7 days, average it over the last 28 days, and divide the first by the second. Pulse counts rest days with the band on as zero and skips days without it, and needs at least 14 days of data. A result near 1 means this week matches your usual. Pulse does this for you on the Fitness screen." },
      { q: "Am I overtraining?", a: "A high ratio is a flag, not a diagnosis. From 1.30 Pulse calls the load Pushing, and from 1.50 High risk, because the last week is well above what you are used to. It cannot see sleep, illness or stress, and the 0.8 to 1.3 sweet spot comes from team-sport injury research and is a rule of thumb. If you feel unwell, see a doctor." },
      { q: "How is this different from Garmin's Load Ratio?", a: "The idea is the same: short-term load divided by long-term load. Garmin's manuals call 0.8 to 1.4 optimal, do not say how many days each window covers, and measure load from EPOC. Pulse uses 7 days against 28, from heart-rate Strain, and bands it Balanced at 0.80 to 1.29. See <a href=\"/blog/garmin-load-ratio-acute-load/\">Garmin Load Ratio and Acute Load</a>." },
      { q: "Is the acute to chronic workload ratio reliable?", a: "It is contested. Critics argue the acute week sits inside the chronic window, and that the ratio adds nothing over a model with no predictors in some re-analyses. Pulse uses it as a description of how your last week compares with your last month, not as a prediction. It compares you only with yourself and says nothing about whether your usual load suits your goals." },
    ],
  },
  "journal-impact": {
    slug: "behaviour-insights",
    title: "Behaviour insights: how habits go with next-day scores",
    description: "Pulse compares days you logged a behaviour with days you did not, and shows the difference in next-day Recovery, HRV and sleep with a bootstrap interval.",
    keywords: ["does alcohol affect hrv", "habit journal for recovery", "habit tracking recovery"],
    shot: "phone-journal",
    sources: [{ label: "Efron B, Tibshirani RJ. An Introduction to the Bootstrap. Chapman & Hall, 1993", url: "https://doi.org/10.1201/9780429246593" }],
    related: ["recovery", "hrv", "sleep"],
    faq: [
      { q: "Does alcohol lower my recovery and HRV?", a: "Pulse can show you what it did for you. Log alcohol yes or no each day, and after at least 5 days of each, it compares next-morning Recovery and HRV on the two groups. It cannot say alcohol caused the change, because late nights and poor sleep tend to come with drinking. A clear Negative label over 90 days is a strong hint, not proof." },
      { q: "How many days of journalling do I need?", a: "At least 5 yes days and 5 no days for the same behaviour within the last 90 days. Below that, Pulse says Needs more data. A behaviour you do twice a month will take months to qualify. Fewer behaviours logged consistently work better than many logged now and then, and days you skip are left out for that behaviour." },
      { q: "Why does a harmless habit show a clear effect?", a: "Pulse checks several behaviours against three scores, and its 90% range means about 1 in 10 behaviours with no real effect will still show a clear one by chance. It also does not adjust for other habits or training, so a tag you log on hard days can look harmful. Treat one result as a prompt to test, not a verdict." },
      { q: "How is this different from WHOOP Journal's Behavior Insights?", a: "The idea is the same: compare yes days with no days on next-day scores. WHOOP's help page sets a 5 yes and 5 no threshold in 90 days and does not publish its statistics. Pulse uses the same threshold, shows the size of the difference and a bootstrap range, and explains that it is an association. See <a href=\"/blog/whoop-journal-behaviours/\">WHOOP Journal explained</a>." },
    ],
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
    faq: [
      { q: "What is a good Sleep Regularity Index?", a: "In a 2024 UK Biobank study of about 61,000 adults, the median SRI was 81 and the middle half of people fell between 73.8 and 86.3. Pulse treats 80% and above as Optimal, 70 to 79% as Sufficient and anything lower as Poor. These are study-based reference points, not diagnoses. <a href=\"/blog/sleep-regularity-index/\">Sleep regularity explained</a> has the research." },
      { q: "Do naps lower my sleep consistency?", a: "Yes. Pulse counts naps as sleep, so a nap at a time you were awake the day before creates a mismatch. A 1-hour nap on one day lowers the index by about 3 points. A nap at the same time each day matches itself and costs little. Days when the band was not worn are skipped, not counted as awake." },
      { q: "How is this different from Google Health's Sleep Score?", a: "Google's Sleep Score is about one night: duration, time to sound sleep, sound sleep, restlessness, awakenings and interruptions. None of its six listed parts measures whether your timing repeats from day to day. Pulse's consistency looks at 7 days, minute by minute, and also feeds 10% of Sleep Performance. See <a href=\"/blog/fitbit-sleep-score-explained/\">Fitbit sleep score explained</a>." },
      { q: "Why is my consistency missing?", a: "Pulse needs 2 worn days in a row within the 7-day window, and a day counts only if the band recorded heart rate for at least half of it. With fewer, there is no value. Sleep Performance then leaves the consistency part out and rescales the other parts. Fitbit's sleep sessions leave out brief wakes, so the figure reads a little higher than a lab measure." },
    ],
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
    faq: [
      { q: "What do CTL, ATL and TSB mean?", a: "They are TrainingPeaks' names for the same idea. CTL (chronic training load) is Fitness, ATL (acute training load) is Fatigue, and TSB (training stress balance) is Form. Pulse uses 42-day and 7-day time constants, the usual ones, but feeds them daily Strain from heart rate rather than TrainingPeaks' own stress scores, so the numbers will not match theirs." },
      { q: "Is a negative Form bad?", a: "Not by itself. Form below zero only says your recent load is heavier than your longer-term load, which is what a training block looks like. Pulse draws no further bands: it does not say how negative is too negative. Read it alongside <a href=\"/metrics/training-balance/\">training balance</a>, and treat a deep, long-running dip as a prompt to check how you feel." },
      { q: "Why is my Fitness chart empty for the first two weeks?", a: "Pulse needs 14 days in a row with Strain data before it draws anything. A day without the band breaks the run and it starts counting again, though a day with the band on and little activity counts as a zero. Even then, treat the first six weeks or so as rough, because the early averages lean on your first week." },
      { q: "How is this different from Google Health's Cardio Load?", a: "Cardio Load is a daily total with no published scale, which resets at midnight. Pulse's Fitness, Fatigue and Form are running averages built from daily Strain, so they show the trend, not one day. Google does not give third-party apps its Cardio Load, so Pulse cannot copy it. <a href=\"/blog/cardio-load-vs-strain/\">Cardio Load vs Strain</a> covers the difference." },
    ],
  },
  "hr-recovery": {
    slug: "heart-rate-recovery",
    title: "Heart rate recovery: the one-minute drop after exercise",
    description: "How Pulse measures heart rate recovery after a hard workout from your wearable's heart rate, and what 12 and 20 bpm mean.",
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
    faq: [
      { q: "Is a heart rate recovery of 25 bpm normal?", a: "In Pulse's bands, 20 bpm or more is Good, 12 to 19 is Typical and under 12 is Low, so 25 is Good. Those cut-offs follow research on treadmill tests, where a drop of 12 bpm or less after the first minute was linked to higher mortality (Cole 1999). A real workout is messier than a lab test, so read one number as a hint and watch your own trend." },
      { q: "Why does my heart rate recovery change from workout to workout?", a: "Pulse takes one reading per eligible workout, so anything that changes the finish moves it: how hard the last minutes were, whether you kept walking or stopped, heat, caffeine, sleep and the wrist sensor's accuracy. Pulse's research notes call it sound as a personal trend, so compare similar workouts, such as the same run route, and ignore single swings." },
      { q: "Why does Pulse say Not enough heart-rate data?", a: "Pulse only reports it when the last 5 minutes held 70% of max heart rate for 2 minutes in a row, the last 30 seconds have at least 3 readings, and the window 45 to 75 seconds after the end has at least 3 more. Fitbit does not always record that densely, and Pulse never fills the gap by guessing." },
      { q: "How is this different from a clinical heart rate recovery test?", a: "The studies behind the 12 bpm line used a supervised treadmill test with a clear stop. Pulse measures free-living workouts from a wrist sensor, so the stop is less clean and the cut-offs do not transfer neatly. It is also unlike the training scores on your device, such as Cardio Load, which add up effort rather than the drop after it. See <a href=\"/metrics/fitness-level/\">Fitness level</a> for a longer-term fitness measure." },
    ],
  },
}

// Two inputs people search for on their own. They are not scores in the app, so they live here, in the same shape.
const EXTRA_DOCS: (ScoreDoc & Meta)[] = [
  {
    slug: "hrv",
    name: "Heart rate variability (HRV)",
    summary: "The night-to-night signal Recovery leans on most, read from your Google Health data.",
    href: "/health/monitor",
    title: "HRV from your wearable: what it is and how Pulse uses it",
    description: "Where Pulse gets your HRV from Google Health, why it compares HRV only with your own baseline, and how it drives Recovery and the Health Monitor.",
    keywords: ["fitbit air hrv", "pixel watch hrv", "hrv baseline", "rmssd"],
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
    title: "Resting heart rate: how Pulse measures it from your sleep",
    description: "How Pulse takes resting heart rate from your wearable's sleep data, and how it feeds Recovery, Strain, the Health Monitor and Pulse Age.",
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
    keywords: meta.keywords ?? [doc.name.toLowerCase(), `${doc.name.toLowerCase()} google health`],
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
