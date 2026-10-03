# Pulse brand: wordmark and mark

The wordmark and app mark for Pulse. Both are hand-written SVG strokes, not a font, so they render identically everywhere. Live preview on the dark ground at every size: `/dev/brand` (development only, 404 elsewhere).

| Favicon (`src/app/icon.svg`) | App icon, maskable (`public/icons/icon-maskable.svg`) |
| --- | --- |
| <img src="../../src/app/icon.svg" width="64" alt="Pulse favicon"> | <img src="../../public/icons/icon-maskable.svg" width="128" alt="Pulse app icon"> |

## The problem

The Home screen showed "PULSE" as tracked Figtree caps, and the favicon was a green recovery ring. The ring is WHOOP's dial language, and neither said "pulse". WHOOP's own wordmark is a custom geometric logotype: wide, uppercase, monoline, with stencil breaks. We wanted the same presence on a dark UI (wide, geometric, confident, white on black) without borrowing WHOOP's letterforms or its stencil device.

## Concepts considered

Every concept was built as real SVG and rendered at 14 px cap height and at 16 px favicon size before choosing.

### Wordmark

| # | Concept | Result |
| --- | --- | --- |
| W1 | **Beat in the S spine.** The S's middle bar carries a spike and a dip. | Rejected. The S counters are only about 5 units tall, so the spike hits the top and bottom bars. At 14 px the S turns into a "$". |
| W2 | **Tall beat in the L foot.** A spike at 40% of the cap height, next to the stem. | Rejected. Next to the stem, the spike makes the L read as "h" or "ʌ" ("PUhSE"). |
| W3 | **Beat in the E's middle arm.** | Rejected. The spike crosses both E counters and the E reads as "Ɛ>". |
| W4 | **Rhythm cut.** A thin negative ECG line sliced through the whole word. | Rejected for the header. At 14 px the cut is under 1 px wide and vanishes. It only works on a splash. |
| W5 | **Stencil breaks.** Detached bars, like WHOOP's wordmark. | Rejected. It is the WHOOP device, so it is not ours. |
| **W6** | **L-to-S ligature beat.** The L's foot runs on, beats once (a spike up, then a dip below the baseline) and becomes the S's bottom bar. L, beat and S are one stroke. | **Chosen.** |

### Mark

| # | Concept | Result |
| --- | --- | --- |
| M1 | **P on a baseline, dip under the stem.** | Rejected. A V hanging under the stem reads as a map pin. |
| M2 | **Beat in the P's open lower-right quadrant.** | Rejected. Anything in that quadrant reads as an R's leg, so the mark said "R". |
| M3 | **P inside the recovery ring.** | Rejected. It keeps the WHOOP dial idea that the old favicon had, which was the original complaint. |
| M4 | **Heart with a P.** | Rejected. Generic health clip art that says nothing about the name. |
| **M5** | **The trace draws the P.** A flat line beats once, runs into the foot of the stem, climbs it and draws the bowl, all in one stroke. | **Chosen.** |

### Why W6 and M5

- **It is about the name.** In both, a pulse trace turns into a letter. The mark is the P drawn by a heartbeat, and the wordmark has the same heartbeat running through it.
- **It is one system.** Both use the same beat (a sharp spike up, then a dip below the baseline), the same monoline stroke, the same square top-left corner on the P and the same 5-unit corner radius. Put the mark next to the wordmark and they read as one family.
- **It keeps letter integrity.** In W6, every letter keeps the strokes that identify it: the L keeps its corner and the S keeps both bowls. The beat lives in space that is already open (the gap between L and S). That is why it survives at 14 px where W1 to W3 failed.
- **It is ownable.** The dip below the baseline is the one tension point in an otherwise calm, wide word. It is what makes the line read as an ECG and not just a peak. It is ours and not WHOOP's (WHOOP's device is stencil breaks).
- **It suits the dark UI.** Monoline white strokes on #0f1113, with no fills, gradients or accent colour. Like WHOOP, the brand stays monochrome and the metrics carry the colour.

## Construction

```mermaid
flowchart LR
  subgraph Grid["Shared rules"]
    A["Monoline stroke, butt caps, miter joins (limit 8)"]
    B["Corner radius 5 on the centreline"]
    C["The beat: spike up, then dip below the baseline"]
  end
  Grid --> W["Wordmark<br/>cap height 20 units<br/>bold 3.2, black 4.4"]
  Grid --> M["Mark<br/>24-unit square<br/>stroke 2.6"]
```

### Wordmark (`src/components/brand/Wordmark.tsx`)

- **Grid.** The cap height is 20 units. The letters are wide: P 19, U 20, L foot 12 units before the beat, S 21, E 17. The gap between letters is 5.5 units. The proportions are about 4.7 : 1, close to WHOOP's width.
- **Stroke.** The glyphs are centreline paths. Their outer edges land on 0 and 20 for any stroke width, because `build(s)` offsets each path by half the stroke. There are two weights:
  - `bold` (3.2 units, 16% of the cap) for the in-app header, 14 to 18 px cap height.
  - `black` (4.4 units, 22%) for a splash, 32 px cap height and up.
- **Letters.**
  - **P:** square outer top-left corner, and the bowl closes at 60% of the cap height.
  - **U:** two radius-5 corners.
  - **S:** squared, with two tighter radii in each half so the bowls fit.
  - **E:** the middle arm is 2 units shorter than the top and bottom arms.
- **The beat.**
  - The spike's half-width is `0.8 x stroke + 1.3`, so its inner counter stays open at both weights.
  - The spike rises 7.5 units (37% of the cap).
  - The dip falls 2.5 units below the baseline. Its miter tip makes the box 1.208 x the cap height.
- **The box includes the dip.** The SVG's height is 1.208 x the cap height. Size the wordmark by the box:

  | Cap height | `className` height |
  | --- | --- |
  | 14 px | `h-[17px]` |
  | 16 px | `h-[19px]` |
  | 18 px | `h-[22px]` |
  | 32 px (splash) | `h-[39px]` |

  To centre the wordmark optically with other items, align on the cap height, not the box. The dip is a descender.

### Mark (`src/components/brand/Mark.tsx`)

- **Path:** one stroke in a 24-unit square.
  1. A lead-in from x = 0 on the baseline (y = 15.5).
  2. A spike to y = 8.5, then a dip to y = 18.5.
  3. Back to the baseline, then into the foot of the stem at x = 10.5.
  4. Up to the cap, around a bowl with radius-4 corners, and back to the stem at y = 9.6.
- **Stroke:** 2.6 units. The drawing spans 21.3 x 22.9 units including the spike's miter tip. The viewBox `-1.35 -0.55 24 24` centres it.
- **Icon files.** They use the same path, exported as `MARK_PATH`.
  - `src/app/icon.svg`: favicon. The mark is at 84% on a tile with rx 5.5. The favicon stroke is heavier, 3.0 instead of 2.6, so it stays crisp at 16 px. This is an optical-size tweak, not a different mark.
  - `public/icons/icon-maskable.svg`: the full-bleed source for the PNGs. The mark is at 70%. Its farthest point, the bowl's corner, is 13.45 units from the centre, which keeps it inside the 80% safe circle (radius 9.6 of 24).

## Rules

### Clear space

- **Wordmark:** keep clear space at least equal to the P's width (19 units, or about 0.95 x the cap height) on all sides. Measure it from the cap box, and measure below from the dip tip.
- **Mark:** keep clear space at least 25% of its size on all sides. The icon tiles already include it.
- **Lockup:** mark first, then the wordmark, with a gap of 0.6 x the wordmark's cap height. Make the mark about 1.6 x the cap height (for example, a `size-7` mark with an `h-[17px]` wordmark).

### Minimum size

| Asset | Minimum | Below the minimum |
| --- | --- | --- |
| Wordmark `bold` | 12 px cap height (`h-[15px]`) | Under 12 px the beat's counter fills in. Use the mark instead. |
| Wordmark `black` | 24 px cap height | Under 24 px, use `bold`. |
| Mark (inline `Mark`) | 16 px | Don't use the mark below 16 px. |
| Favicon | 16 px | It is built for 16 px. |

### Colour

- Use `currentColor` only. The default is the foreground (white).
  - On Home, use `text-foreground-secondary` to match the current header tone, as WHOOP's grey in-app wordmark does.
- **Don't** colour the beat differently from the letters.
- **Don't** put the wordmark on a recovery or strain colour.
- **Don't** add a glow, a gradient or an outline.
- The icon grounds are #0f1113, the `--background` token.

### Don'ts

- **Don't** set "PULSE" in a font as a stand-in.
- **Don't** stretch the wordmark or the mark, or change their letter spacing.
- **Don't** remove the beat or the dip.
- **Don't** add a tagline under the wordmark in the header.
- **Don't** put the mark inside the recovery ring.
- **Don't** animate the beat on every screen. If it animates anywhere, do it once, on the splash, as a draw-on of the stroke, and respect `prefers-reduced-motion`.

## Usage

```tsx
import { Wordmark } from "@/components/brand/Wordmark"
import { Mark } from "@/components/brand/Mark"

<Wordmark className="h-[17px] text-foreground-secondary" />    // Home header, 14 px cap height
<Wordmark weight="black" className="h-[39px]" />                // splash
<Mark className="size-7" />                                     // tablet rail, sidebar
```

Both components render `role="img"` with `aria-label="Pulse"`. Pass `title` to change the label and add a tooltip. When the asset sits inside a link that already names it (for example, `aria-label="Pulse home"`), add `aria-hidden` on a wrapping element, not on the SVG.

## Where each asset goes

```mermaid
flowchart TD
  W["Wordmark (bold)"] --> H["Home, above the dials<br/>src/app/(app)/page.tsx"]
  W --> S["Laptop sidebar header<br/>src/components/shells/AppNav.tsx"]
  WB["Wordmark (black)"] --> L["Splash / first load<br/>src/app/(app)/loading.tsx"]
  M["Mark"] --> R["Tablet rail home button<br/>AppNav.tsx Rail"]
  M --> S
  M --> A["More: About footer<br/>src/app/(app)/more/page.tsx"]
  M --> F["src/app/icon.svg<br/>favicon"]
  M --> MK["public/icons/icon-maskable.svg"]
  MK --> P192["icon-192.png<br/>manifest, maskable + any"]
  MK --> P512["icon-512.png<br/>manifest, maskable + any"]
  MK --> AP["src/app/apple-icon.png<br/>apple-touch-icon, 180 px"]
```

Placement in the screens is a separate change. These are the targets:

| Where | Today | Replace with |
| --- | --- | --- |
| Home, above the dials (`src/app/(app)/page.tsx`, the `<p aria-hidden>Pulse</p>` in `slots.top`) | Tracked Figtree caps, 13 px, `text-foreground-secondary` | `<span aria-hidden className="flex justify-center text-foreground-secondary"><Wordmark className="h-[17px]" /></span>`, keeping it hidden from assistive tech as now (the page has its own title). |
| Laptop sidebar header (`AppNav.tsx`, the xl `<nav>`'s first `<Link href="/">`) | Tracked text "Pulse" | The lockup: `<Mark className="size-7" />` + `<Wordmark className="h-[17px]" />`, gap-2.5, inside the existing h-14 link. Wrap both in `<span aria-hidden>` and add `aria-label="Pulse home"` to the link. |
| Tablet rail (`AppNav.tsx` `Rail`, the "P" letter in the size-10 home button) | A Barlow "P" | `<Mark className="size-6" />` |
| Loading / splash (`src/app/(app)/loading.tsx` returns `HomeSkeleton`; for a cold start, the PWA splash uses the manifest icon and `background_color`) | Skeleton only | Keep the skeleton for in-app navigation. For a first-load splash, centre `<Wordmark weight="black" className="h-[39px]" />` on `--background`. |
| More: About footer (`src/app/(app)/more/page.tsx`, the "Pulse {version} · scoring v…" line) | Text only | Put `<Mark className="size-8 text-muted-foreground" />` above the version line, centred, with 8 px of space. |

## Regenerating the icons

The PNGs are rendered once from the SVG source with `rsvg-convert` (Homebrew librsvg) and committed:

```sh
rsvg-convert -w 512 public/icons/icon-maskable.svg -o public/icons/icon-512.png
rsvg-convert -w 192 public/icons/icon-maskable.svg -o public/icons/icon-192.png
rsvg-convert -w 180 public/icons/icon-maskable.svg -o src/app/apple-icon.png
```

If you change `MARK_PATH` in `Mark.tsx`, paste the new path into both icon SVGs and rerun these commands.
