# WHOOP vs Pulse: Activities and Journal UI gaps

Scope: workout and running detail, Add Activity, Select Activity, Start Activity, the daily Journal screen, Select Behaviors, Save/Saved and the Dismiss dialog. WHOOP evidence is `docs/research/whoop-walkthrough/activity-*.png` (9) and `journal-*.png` (15). Pulse was checked in demo mode on a 390 px phone and in the source under `src/`. Intentional differences already recorded in `docs/design/spec.md` are marked "intentional" and are not counted as defects, but they are still listed so the team can reverse them if cloning is the goal.

## 1. Summary

Pulse already matches WHOOP's activity detail closely: strain hero, Typical range header, six zone rows (Zone 0 to 5) with bpm range, share, duration and hatched track, 30-day key statistics tiles, and a coach insight. The big gaps are whole flows that need a data source Pulse does not have (manual Add Activity, Start Activity with live HR and map) or a picker that does not exist (Select Activity). The Journal gap is structural: WHOOP's daily screen is a full-screen modal with its own day strip, sentence-style yes/no questions grouped Daytime / Nighttime / Status, a follow-up slider, notes and a "Saved" screen, while Pulse's check-in is a bottom sheet of icon rows with Yes/No text toggles. Select Behaviors (searchable, categorised catalogue with checkboxes) has no Pulse equivalent; Pulse's More › Behaviours is a show/hide and reorder list of about nine defaults plus custom ones.

Gap count by severity (29 total): missing-screen 4, missing-element 14, behaviour 4, visual 7.

## 2. WHOOP navigation for this area

Edges marked (inferred) are not shown in a screenshot; only the two ends are visible.

```mermaid
flowchart TD
  Home["Home / day timeline (not in these shots)"] -->|tap activity row (inferred)| WL["Activity detail: Weightlifting<br/>activity-01..04"]
  Home -->|tap running row (inferred)| RUN["Activity detail: Running<br/>activity-05"]
  WL -->|... menu top right| MENU["Overflow menu (contents not shown)"]
  WL -->|ADD EXERCISES arrow| EX["Log exercises (not shown)"]
  WL -->|X on banner| WL
  WL -->|coach toast chevron| COACH["Expanded coach message (not shown)"]
  WL -->|View HR Settings link| HRS["HR settings (not shown)"]
  WL -->|back chevron| Home
  Home -->|+ Add (inferred)| ADD["ADD ACTIVITY form<br/>activity-06"]
  ADD -->|SELECT ACTIVITY row| SEL["SELECT ACTIVITY picker<br/>search, ALL / STRAIN / RECOVERY / SLEEP<br/>MOST RECENT, ALL A-Z<br/>activity-07"]
  SEL -->|tap an activity (inferred)| ADD
  ADD -->|Start / End time pills| TIME["Date-time pickers (not shown)"]
  ADD -->|WRIST BAND button| LOC["Wear location choice (not shown)"]
  ADD -->|SAVE (greyed until valid, inferred)| Home
  ADD -->|X| Home
  Home -->|Start activity (inferred)| LIVE["START ACTIVITY live screen<br/>map, live HR, STRAIN TARGET toggle<br/>activity-08"]
  LIVE -->|activity name + chevron| PICK["Activity dropdown picker<br/>same list as Select Activity<br/>activity-09"]
  PICK -->|choose| LIVE
  LIVE -->|START ACTIVITY| REC["Recording (not shown)"]
  LIVE -->|X| Home

  JHome["Journal entry (not shown)"] --> JQ["JOURNAL daily questions<br/>day strip, DAYTIME / NIGHTTIME / STATUS<br/>journal-01, 10, 11"]
  JQ -->|date chips or < TODAY >| JQ
  JQ -->|check on some questions| SLD["Follow-up slider<br/>When did you last consume them?<br/>journal-12..14"]
  JQ -->|scroll down| NOTES["NOTES: Add a note...<br/>journal-02"]
  JQ -->|pencil top right| SB["SELECT BEHAVIORS sheet<br/>search, category tabs, checkboxes<br/>journal-04..09"]
  SB -->|SAVE BEHAVIORS| JQ
  SB -->|X| JQ
  JQ -->|SAVE JOURNAL| SAVED["SAVED: Have a great day!<br/>journal-03"]
  JQ -->|X| DIS["DISMISS JOURNAL? dialog<br/>journal-15"]
  DIS -->|NO, COMPLETE JOURNAL| JQ
  DIS -->|YES, DISMISS JOURNAL| JHome
  DIS -->|X| JQ
```

## 3. Gaps

Severity: missing-screen, missing-element, behaviour, visual. "Pulse ref" is `path:line` in `src/` (verified).

| # | Gap | Severity | WHOOP ref | Pulse ref | Notes |
|---|-----|----------|-----------|-----------|-------|
| 1 | Add Activity form: modal titled "ADD ACTIVITY" with X at left; blue info banner "Your updates will help WHOOP autodetect and classify your future activities more accurately."; a "SELECT ACTIVITY" row with person icon and chevron; "TIME" section with "Start Time" and "End Time" pills ("Apr 14 at 1:42 PM"); "LOCATION" section asking "Where did you wear your WHOOP?" with a "WRIST BAND" button; full-width SAVE button, greyed until valid (inferred). | missing-screen | activity-06 | none. Home has no add button: `docs/design/spec.md:1412` | Intentional per spec.md:1412 ("+ Add activity" not adopted, Pulse imports activities). Needs data source: Google Health would have to accept a written exercise session, which Pulse does not do. The wear-location question and the autodetect banner have no Fitbit equivalent. |
| 2 | Select Activity picker: back chevron, title "SELECT ACTIVITY", rounded search field "Search for Activities", underline tabs ALL / STRAIN / RECOVERY / SLEEP, section rule "MOST RECENT" (Walking, Running, Weightlifting, Stairmaster, Functional Fitness), section rule "ALL A-Z" (Acupuncture, Air Compression, Air Compression (Normatec), American Football...), each row a card with a grey sport icon and a bold caps name. The same list opens as a dropdown from the Start screen with white icons. | missing-screen | activity-07, activity-09 | none. Closest is the sport filter pills at `src/app/(app)/activities/page.tsx:55` (kinds limited to `ActivityKind` at `src/server/queries/types.ts:14`) | Pulse has five kinds (run, ride, walk, strength, workout), no catalogue, no search, no tab split by Strain/Recovery/Sleep type. Needed only if Add or Start is built; the catalogue itself is static data and needs no data source. |
| 3 | Start Activity live screen: dark map background, top bar with X, sport icon + "WALKING" and a collapse chevron, a "Track Route" toggle (blue knob, top right), a large blue circle showing a heart icon and live HR "83" with battery "85%" under it, a white bottom card with a ring + "11.2" and "STRAIN TARGET" and a black-knob toggle, and a full-width blue "START ACTIVITY" pill. | missing-screen | activity-08 | none. Spec says no live HR: `docs/design/spec.md:2063` | Intentional per spec.md:2063 (no live HR). Needs data source: live heart rate and GPS from the strap/watch while recording; Google Health sync is after the fact. The "11.2" strain target could be shown from Pulse's own Strain Target without recording. |
| 4 | "SAVED" confirmation: full-screen black, 120 px green ring with a check, "SAVED" in white caps bold, "Have a great day!" in grey. It replaces the journal entirely. | missing-screen | journal-03 | `src/app/(app)/journal/CheckIn.tsx:214` (a "Check-in saved" toast) | Pulse closes the sheet and shows a toast. The toast is quicker; the WHOOP screen is a ceremony. |
| 5 | Cardio vs Muscular split on workout detail: label "CARDIO" left, "MUSCULAR" right, a bar with a white divider thumb at the split, "35%" and "65%" below. Shown for Weightlifting only; Running has no split. | missing-element | activity-01, activity-04 | none. Hero is at `src/app/(app)/activity/[id]/page.tsx:98` | Needs data source: WHOOP says muscular load is "auto-estimated"; Pulse has heart rate only, so any split would be invented. Skip or label as an estimate (inferred). |
| 6 | Strain comparison chip on the hero: "12.3" blue with a grey chip "▲ 11.7" (the average for this sport; the "30-day average" meaning is inferred from the Key Statistics heading) next to it. Running shows "10.0 ▲ 7.9". | missing-element | activity-01, activity-05 | `src/app/(app)/activity/[id]/page.tsx:105-123` (value only, with a "Day strain" caption instead) | Pulse already computes per-sport 30-day averages for zones (`ZoneRow.typical`) and tiles; strain average is the same query shape. |
| 7 | "ACTIVITY STEPS" as the second hero stat on a run ("1,037" with chip "▲ 810"). WHOOP's hero is strain + steps for running, strain + cardio/muscular bar for lifting; Duration is shown only above the zone rows. | missing-element | activity-05 | `src/app/(app)/activity/[id]/page.tsx:110-113` (Duration is the second hero stat; no steps) | Needs data source: steps within the activity window. Pulse reads daily steps (`activities/page.tsx:130`) but not per-workout steps; Google Health exercise sessions may include steps (unchecked). |
| 8 | Dismissible education banner at the top of a workout: gradient-outlined card "Get More from Your Workouts" / "Muscular load is auto-estimated for Strain. For even more precision, log exercises with WHOOP AI." / "ADD EXERCISES →" with an X. | missing-element | activity-01 | none | Needs data source (exercise logging). Do not clone the copy: it promotes a feature Pulse lacks. |
| 9 | Overflow "..." button at the top right of the activity header (three dots). Menu contents are not shown; likely edit/delete (inferred). | missing-element | activity-01..05 | `src/components/shells/DetailShell.tsx:23` supports an `action` slot; the page does not pass one: `src/app/(app)/activity/[id]/page.tsx:38-45` | Pulse cannot edit or delete Fitbit workouts, so a menu may have nothing useful in it (compare "Edit" not adopted at spec.md:1778). A share or "report wrong sport" item is an option. |
| 10 | Zone footnote with link: "Zone ranges automatically updated on 2026-04-02. View HR Settings" (underlined link). | missing-element | activity-02, activity-03 | `src/components/charts/ZoneBars.tsx:121` (note text only: "Zones on your heart-rate reserve: resting 55 to max 183 bpm."); note passed at `src/app/(app)/activity/[id]/page.tsx:63` | Pulse explains the method (heart-rate reserve) which WHOOP does not. The link to a settings screen for max HR / resting HR is missing; verify a Pulse settings page for it exists before linking. |
| 11 | Key Statistics layout: heading "KEY STATISTICS" left and "VS. 30 DAY AVERAGE" right; tiles are a horizontally scrolling carousel (partly clipped tile at the left edge) with icon + caps label, big value + unit ("160 bpm"), and a small chip with arrow and the 30-day average ("▲ 159bpm", "▼ 0:53:12"). Tiles seen: Calories, Avg HR (inferred from icon), Max HR, Duration. | visual | activity-02, activity-03 | `src/app/(app)/activity/[id]/page.tsx:70-77` (2-column grid, Duration filtered out at line 35) | Pulse has the content and the chip; layout differs (grid vs carousel) and Duration is not a tile. Pulse adds Distance and Pace, which WHOOP's lifting shots do not show. |
| 12 | Coach toast docked at the bottom: a rounded dark-purple pill with a "W" avatar and a one-line coach message, truncated with "..." and a chevron to expand; while loading it shows "Analyzing...". It floats above all content and overlaps the last zone rows. | behaviour | activity-01..05 (toast), activity-01 ("Analyzing...") | `src/app/(app)/activity/[id]/page.tsx:90` (static `InsightCard` at the end of the page) | Intentional per spec.md:776 (floating coach pill not adopted; coach is its own screen). Listed because the team asked to clone WHOOP; the pulse-style card is not an AI toast and has no loading or expand state. |
| 13 | HR chart style: WHOOP's chart is full-bleed with no card, a bright blue line over a darker blue gradient, y labels "75 ... 175", and dashed vertical lines with a dot at the workout start and end and bold white times "10:37" / "11:29" underneath. Pulse already draws the gradient fill, dotted gridlines and the minutes before and after the workout (grey line outside, blue inside), but lacks the dashed start/end markers with time labels. Pulse adds a "Run" span bar above the plot and Z1-Z3 zone strips at the right edge, which WHOOP does not have. Pulse's plot sits inset with axis ticks every 15 minutes (18:30, 19:00) rather than edge to edge. | visual | activity-01, activity-02, activity-05 | `src/components/charts/IntradayHrChart.tsx:145-167` (zone strip at lines 84-110) | Checked on the recaptured Pulse tile `activity-detail-01`. |
| 14 | Typical-range indicator on zone rows: WHOOP shows a shaded hatched band bounded by two dashed ticks (e.g. Zone 1 "typical" band extends past the fill; Zone 0 band shows 31% bar inside a wider band), not a single marker. | visual | activity-02, activity-05 | `src/components/charts/ZoneBars.tsx:115` (one 2 px tick at the typical share) | Pulse stores only a mean share per zone. A band would need a spread (for example the 30-day range). Minor. |
| 15 | Zone row colour details: percentage text takes the zone colour even at 0% (Zone 5 and 4 "0%" are orange); Zone 0 bar is solid white and Zone 1 bar light blue-grey; zero-time rows are dimmed but kept readable; "0:00" has the seconds in grey. Zone 3 green, Zone 2 blue, Zone 4 light orange, Zone 5 deep orange. | visual | activity-02, activity-05 | `src/components/charts/ZoneBars.tsx:40` (colour map), `ZoneBars.tsx:99` (colour only when zone > 1 and seconds > 0) | Pulse already uses the same cool-to-hot scheme. Differences are the 0% colouring and the Zone 0 white fill (Pulse falls back to `bg-foreground/30` at `ZoneBars.tsx:113`). Pulse also adds "+24 MIN" deltas (line 100) that WHOOP does not show. |
| 16 | Journal presentation: a full-screen modal, not a sheet. Top bar: X left, "JOURNAL" centred, pencil right. A sand/tan gradient glows at the very top of the screen and fades to near-black by the middle. Content starts below the bar. "SAVE JOURNAL" is a full-width white pill pinned at the bottom with a gradient fade behind it. | visual | journal-01, journal-02, journal-10, journal-11 | `src/app/(app)/journal/CheckIn.tsx:245-263` (`ResponsiveSheet`, title "Check in", `size="tall"`) | Pulse's sheet follows spec §5 sheet rules (X left, centred title). No tan gradient; no pencil. Gradient colour is the one visually unique element. |
| 17 | Day navigation inside the journal: a "< TODAY >" switcher (right chevron greyed on today) and a 7-day strip of tall rounded pills (weekday "Thu", date "9", green check badge), the selected day outlined with a white 2 px ring. All 7 days show green checks. Tapping a day switches the entry being edited. | missing-element | journal-01, journal-10 | `src/app/(app)/journal/CheckIn.tsx:104` (day comes from `?d=` when the sheet opens and cannot change in the sheet); strip lives on the page at `src/app/(app)/journal/page.tsx:38` | Pulse has the strip with the same check-badge idea (`src/components/metrics/DayStrip.tsx:99-110`) but it is behind the sheet, uses single-letter weekdays and a filled tile for the selected day instead of an outline. |
| 18 | Heading "What's happening today, April 15?" in 32 px white at the left, under the strip. | missing-element | journal-01 | `src/app/(app)/journal/CheckIn.tsx:248-249` (title "Check in", description is the short date) | Copy and hierarchy change: a question as the screen's hero rather than a task name. |
| 19 | Section grouping by time of day: "DAYTIME", "NIGHTTIME", "STATUS" (caps with a hairline rule). WHOOP lists "Experiencing a fever?", "Took electrolyte supplements?", "Worked from home?" under Daytime; "Wore mouth tape while sleeping?", "Worked the night shift?" under Nighttime; "Feeling sick or ill?" under Status. | behaviour | journal-01, journal-10, journal-11, journal-14 | `src/lib/journal.ts:18-23` (Evening, Recovery, Context, Your behaviours) | Pulse groups by purpose and its behaviours are evening-oriented (Alcohol, Late caffeine). Would need a `timeOfDay` field per behaviour. |
| 20 | Row design: each question is a full-sentence yes/no prompt on its own rounded card ("Took electrolyte supplements?") with no icon; cards have a faint translucent fill that fades with the page gradient. | visual | journal-01, journal-10 | `src/app/(app)/journal/CheckIn.tsx:293-295` (icon + noun label such as "Alcohol", divider rows, no cards) | Copy lives in `src/lib/journal.ts` labels; WHOOP's full sentences come from its catalogue (see gap 28). |
| 21 | Answer control: two 40 px rounded-square buttons side by side, an "x" icon (No) and a check icon (Yes). Unanswered: both mid-grey. Selected "x": white fill, black x. Selected check: light-blue fill (`#6ab4f0`-ish), dark check. | visual | journal-01, journal-10, journal-14 | `src/app/(app)/journal/CheckIn.tsx:296-313` (text "No" / "Yes" in a ToggleGroup; Yes = white fill) | Pulse's text labels are clearer and meet the 44 px target; the WHOOP icon pair is a clone-fidelity item. Note WHOOP makes the check blue and the x white. Several rows already show x selected before the user tapped (default no, inferred). |
| 22 | Follow-up slider: choosing check on "Took electrolyte supplements?" expands the card with a divider, "When did you last consume them?", a value "--" on the right, and a grey track with a white 40 px thumb at the far left. | missing-element | journal-12, journal-13, journal-14 | none | Needs data model: Pulse stores only yes/no per tag per day (`saveJournalEntry({day, tag, value})`, `CheckIn.tsx:209`). Pulse's "Late caffeine" and "Late meal" tags cover timing by splitting the behaviour. Mark as inferred that the slider value is a time or hours-before-bed; the "--" placeholder suggests it is optional. |
| 23 | Notes: after the last question, a "NOTES" section with a bordered text field "Add a note...". | missing-element | journal-02 | none (no note field in `src/server/actions/journal.ts`) | Needs a notes column per journal day. |
| 24 | Dismiss dialog: centred card over a dimmed journal, "DISMISS JOURNAL?" in caps, body "Choosing 'Yes' will discard the data you have provided. You may return to complete the journal entry later", a checkbox "DON'T SHOW ME THIS MESSAGE AGAIN", a white primary "NO, COMPLETE JOURNAL", an outlined "YES, DISMISS JOURNAL", and an X at top right. It appears on X even in a state the screenshot suggests has changes (inferred). | behaviour | journal-15 | `src/app/(app)/journal/CheckIn.tsx:358-377` ("Discard changes?" with Keep editing / Discard, only when dirty) | Pulse's dirty-only guard is arguably better UX. Missing: the "don't show again" checkbox, the matching copy, and the primary action being "complete" rather than "keep editing". |
| 25 | Pencil icon at the top right of the Journal that opens Select Behaviors from inside the daily screen (inferred from placement, the next screenshots show the sheet). | missing-element | journal-01, journal-04 | none. The editor is a separate page, `src/app/(app)/more/behaviours/Behaviours.tsx:23`, reached from More. | Pulse needs a route from the check-in sheet to the behaviours editor, or the editor inside the sheet. |
| 26 | Search field in Select Behaviors: rounded dark field with magnifier, placeholder "Search for Behaviors". | missing-element | journal-04..09 | none (no search in `Behaviours.tsx` or `CheckIn.tsx`) | Useful only once the catalogue is large (gap 28). |
| 27 | Category tabs in a horizontally scrolling row: ALL, DRUGS & MEDICATION, HEALTH & SYMPTOMS, then (scrolled) "...NAL HEALTH" (likely PERSONAL HEALTH, inferred), LIFESTYLE, MENTAL WELLBEING, "NU..." (likely NUTRITION, inferred). Active tab has a white underline. | missing-element | journal-04, journal-06 | none (`Behaviours.tsx` groups by Evening / Recovery / Context only, `src/lib/journal.ts:18-23`) | Pulse groups map to purpose, not WHOOP's topic categories. |
| 28 | Behaviour catalogue: a long A-Z list of defined behaviours (Accutane, Acne, Acupuncture, Adaptogen Mushrooms, Added Sugar, AD(H)D Medication, Afternoon Snack, AG1, Air Travel, Alcohol, Allergy Medication, Alpha-lipoic acid, Anti-Androgen, Anti-Anxiety Medication, Blood Donation, Caffeine, Camping, Caregiving, Car or Train travel, Family and Friends, Feeding Baby at Night, Intermittent Fasting, Night Shifts, Nursing, On-Call Shift, Outdoor Time, Parenting, Plasma Donation, Ramadan, Relationship Status, Remote Work, Sexual Activity, Shared Bedroom With Child...). Each row has a name and a one-line daily question under it ("Took Accutane?"). | missing-element | journal-04..09 | `src/lib/journal.ts:5-15` (9 built-in tags with icons: alcohol, late caffeine, late meal, screen in bed, meditation, stretching, sauna, travel, illness) | Pulse also allows custom tags (`CheckIn.tsx:319-351`, `Behaviours.tsx:75`) which WHOOP's screens do not show. Each added tag needs 5 days with and without for Insights (spec.md §7.12 empty copy), so a big catalogue will mostly stay at "Needs more data". |
| 29 | Selection model: an at-top "selected" group (journal-04 shows "Mouth Tape ✓") above a "NOT SELECTED" rule, 28 px checkboxes (white outline, blue fill with a check when on) on the right of each row, and a white-outline pill "SAVE BEHAVIORS" pinned at the bottom with a gradient behind it; sheet has a drag grabber at the top and X at left. Nothing applies until Save. | behaviour | journal-04..09 | `src/app/(app)/more/behaviours/Behaviours.tsx:118` (switch per row that writes instantly, up/down reorder arrows at line 111, no save button) | Pulse's instant-write with optimistic rollback (`Behaviours.tsx:42-52`) and reorder have no WHOOP equivalent in these screenshots. |

## 3a. Status, activities-and-journal phase (2026-10-08)

Build steps for the last phase (shared with [dashboard-health-community-coach.md](dashboard-health-community-coach.md)): 1 shared full-screen sheet (`ResponsiveSheet size="screen"`) and `DoneScreen`, 2 journal data (behaviour catalogue, notes, follow-up value), 3 Journal full-screen modal, 4 Select Behaviors, 5 activity detail, 6 Add Activity, Select Activity and Start Activity (hidden), 7 My Dashboard, 8 Health tab, 9 Healthspan factors, 10 Coach, 11 landing site. "Hidden" means the component is built but off in `src/lib/features.ts` until Pulse has a data source. Decisions are recorded in `docs/design/spec.md` §11 from R36 onwards.

| # | Plan | Status |
|---|---|---|
| 1 | Step 6: Add Activity form, behind a flag (Google Health takes no written sessions) | Open |
| 2 | Step 6: Select Activity picker (static catalogue), opened by the hidden Add and Start flows | Open |
| 3 | Step 6: Start Activity live screen, behind `FEATURES.startActivity` | Open |
| 4 | Steps 1 and 3: SAVED screen (`DoneScreen`) replaces the toast | Done (R37) |
| 5 | Step 5: Cardio / Muscular split, behind a flag (no muscular load source) | Open |
| 6 | Step 5: strain chip against the sport's 30-day average | Open |
| 7 | Step 5: Activity Steps from the step minutes inside the workout | Open |
| 8 | Step 5: "Get More from Your Workouts" banner, behind `FEATURES.strengthTrainer` | Open |
| 9 | Step 5: overflow menu (the day's Strain, heart-rate settings) | Open |
| 10 | Step 5: zone footnote links "View HR Settings" to the profile in `/settings` | Open |
| 11 | Step 5: Key Statistics carousel with a Duration tile | Open |
| 12 | Step 10: coach pill ("Analyzing…") replaces the insight card when the coach is on | Open |
| 13 | Step 5: dashed start and end markers with times; the span bar and zone strips go | Open |
| 14 | Step 5: typical band on zone rows | Open |
| 15 | Step 5: zone colours at 0%, Zone 0 white; the "+N min" deltas go | Open |
| 16 | Steps 1 and 3: Journal as a full-screen modal with the sand glow and the pencil | Done (R37, R38) |
| 17 | Step 3: day strip and "‹ TODAY ›" inside the journal | Done (R37) |
| 18 | Step 3: "What's happening today, April 15?" heading | Done (R37) |
| 19 | Steps 2 and 3: Daytime / Nighttime / Status groups | Done (R37) |
| 20 | Step 3: one card per full-sentence question, no icon | Done (R37) |
| 21 | Step 3: ✕ / ✓ answer buttons (44 px) | Done (R37) |
| 22 | Steps 2 and 3: follow-up slider | Done (R37) |
| 23 | Steps 2 and 3: Notes | Done (R37) |
| 24 | Step 3: "Dismiss journal?" dialog with "Don't show me this message again" | Done (R37) |
| 25 | Step 4: pencil opens Select Behaviors | Done (R38) |
| 26 | Step 4: search field | Done (R38) |
| 27 | Steps 2 and 4: category tabs | Done (R38) |
| 28 | Steps 2 and 4: behaviour catalogue with a daily question per row | Done (R38) |
| 29 | Step 4: selected group, checkboxes and SAVE BEHAVIORS; reorder and instant toggles go | Done (R38) |

## 4. Already matches

- Activity header: back chevron left, sport icon, sport name in caps, time range "10:37 to 11:29" under it. Pulse: `src/app/(app)/activity/[id]/page.tsx:38-43`.
- Hero "ACTIVITY STRAIN" in blue with a caps caption (the number side; comparison chip is gap 6).
- Time-in-zones block: "TYPICAL RANGE" legend at the left with a hatched swatch, "DURATION" with h:mm:ss at the right, six cards Zone 5 down to Zone 0, each with zone name, bpm range ("157-170 BPM", "<115 BPM", "184+ BPM"), percentage, duration with small seconds, 12 px hatched track, zero rows dimmed. Pulse: `src/components/charts/ZoneBars.tsx:62-122`; spec.md:1057.
- Key statistics heading with "vs. 30-day average" and per-tile comparison chip. Pulse: `src/app/(app)/activity/[id]/page.tsx:70`.
- Coach-style insight under the workout (placement differs; see gap 12).
- Day strip with green check badge for completed days on Journal. Pulse: `src/components/metrics/DayStrip.tsx:99-110`; `src/app/(app)/journal/page.tsx:38`.
- A daily check-in driven by a user-chosen behaviour list, with a hidden behaviour dropping out of the check-in but staying in past data. Pulse: `Behaviours.tsx:54-58` and the copy on `more/behaviours` (tile `more-behaviours-01`).
- Section caption with trailing hairline rule inside sheets (WHOOP "DAYTIME ———"). Pulse: `SHEET_SECTION` used at `src/app/(app)/journal/CheckIn.tsx:285`; spec.md:688.
- Primary action as a full-width white pill at the bottom of the sheet. Pulse: `CheckIn.tsx:259` (`size="sheet"`); spec.md:689.
- Discard guard before closing a changed journal (WHOOP: always ask; Pulse: only when changed).

## 5. Pulse extras not in WHOOP's screens

Not gaps, but cloning must decide whether to keep them: Activities list page with 30-day summary and sport filter pills (`src/app/(app)/activities/page.tsx`), Heart rate recovery card (`activity/[id]/page.tsx:83`), Distance and Pace tiles, "+N MIN" zone deltas, Log tiles (Water, Food, Weight, Mood) and Insights and History on the Journal page (`src/app/(app)/journal/page.tsx:47-108`), custom behaviours and reorder arrows.
