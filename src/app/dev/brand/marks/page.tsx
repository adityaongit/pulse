import { notFound } from "next/navigation"

export const metadata = { title: "Mark concepts", manifest: null }

// Round 2 mark concepts (docs/design/brand.md). Each draws white on the #0f1113 ground in a
// 24-unit square, inside the maskable safe circle (radius 9.6). Cut-outs paint the ground colour;
// the chosen one becomes a proper mask in Mark.tsx.
const BG = "#0f1113"
const FG = "#fff"
const BEAT = { fill: "none", stroke: FG, strokeMiterlimit: 8 } as const

// `art` is a function when it needs <defs>: gradient ids must be unique per <svg> on the page.
type Concept = { id: string; name: string; why: string; art: React.ReactNode | ((uid: string) => React.ReactNode) }

const CONCEPTS: Concept[] = [
  {
    id: "1",
    name: "Spike",
    why: "One heartbeat stroke and nothing else: the most direct reading of the name.",
    art: <path d="M3.5 12.8H7.6L10.6 7L14.2 17L16.6 12.8H20.5" strokeWidth={2.6} {...BEAT} />,
  },
  {
    id: "2",
    name: "Ping",
    why: "A solid dot sends out one ring: a live signal, the moment a pulse is read.",
    art: (
      <>
        <circle cx={12} cy={12} r={3.3} fill={FG} />
        <circle cx={12} cy={12} r={7.6} fill="none" stroke={FG} strokeWidth={2.2} />
      </>
    ),
  },
  {
    id: "3",
    name: "Circle + bar P",
    why: "A P built from two primitives, a bar and a ring, like a set square drawing.",
    art: (
      <>
        <rect x={6.25} y={4.5} width={3.5} height={15} fill={FG} />
        <circle cx={12.25} cy={10.5} r={4.25} fill="none" stroke={FG} strokeWidth={3.5} />
      </>
    ),
  },
  {
    id: "4",
    name: "Two beats",
    why: "Two staggered bars: lub and dub, the rhythm of a heartbeat at its simplest.",
    art: (
      <>
        <rect x={6.9} y={4.5} width={4.2} height={11} rx={2.1} fill={FG} />
        <rect x={12.9} y={8.5} width={4.2} height={11} rx={2.1} fill={FG} />
      </>
    ),
  },
  {
    id: "5",
    name: "Heavy p",
    why: "A lowercase p: a heavy ring, a long descender and one angled cut where the stem starts.",
    art: (
      <>
        <circle cx={12} cy={9.2} r={3.9} fill="none" stroke={FG} strokeWidth={4.2} />
        <path d="M6 7.7L10.2 5.2V19.4H6Z" fill={FG} />
      </>
    ),
  },
  {
    id: "6",
    name: "Cut beat",
    why: "A solid white tile with the beat cut clean through it. It reads loudest in a row of icons.",
    art: (
      <>
        <rect x={4} y={4} width={16} height={16} rx={4.5} fill={FG} />
        <path d="M2 13H8L10.5 7.2L13.5 16.8L15.6 13H22" strokeWidth={2.2} fill="none" stroke={BG} strokeMiterlimit={8} />
      </>
    ),
  },
  {
    id: "7",
    name: "Notched dial",
    why: "A heavy ring with one cleft at the top: a dial index that also reads as the top of a heart.",
    art: (
      <>
        <circle cx={12} cy={12} r={7} fill="none" stroke={FG} strokeWidth={3.6} />
        <path d="M9.4 1.5H14.6L12 8.4Z" fill={BG} />
      </>
    ),
  },
  {
    id: "8",
    name: "Dot-counter P",
    why: "A solid P whose counter shrinks to a single dot, like a beat held inside the letter.",
    art: (
      <>
        <rect x={6.5} y={4.5} width={3.6} height={15} fill={FG} />
        <path d="M10 4.5H12.5A5 5 0 0 1 12.5 14.5H10Z" fill={FG} />
        <circle cx={12.4} cy={9.5} r={1.75} fill={BG} />
      </>
    ),
  },
]

// Option 4 (two staggered beats) in the app's data colours from globals.css. Contrast on #0f1113:
// recovery green 11.8, optimal 12.7, strain text 6.6, sleep 6.9, recovery red 4.8 (graphics need 3).
const C = { green: "#19ec06", yellow: "#ffde00", red: "#ff0026", strain: "#0093e7", strainText: "#1fa0f0", sleep: "#7ba1bb", optimal: "#00f19f" }
const beats = (left: string, right: string) => (
  <>
    <rect x={6.9} y={4.5} width={4.2} height={11} rx={2.1} fill={left} />
    <rect x={12.9} y={8.5} width={4.2} height={11} rx={2.1} fill={right} />
  </>
)

const VARIANTS: Concept[] = [
  { id: "4a", name: "Mono", why: "White on black, like the in-app type. The baseline the others are judged against.", art: beats(FG, FG) },
  { id: "4b", name: "Scores", why: "Recovery green, then strain blue: the two beats are the app's two headline scores.", art: beats(C.green, C.strain) },
  { id: "4c", name: "Night and day", why: "Sleep blue, then recovery green: the night you slept and the morning score it earns.", art: beats(C.sleep, C.green) },
  { id: "4d", name: "Green beat", why: "One accent: the second beat lands in recovery green, the first stays white.", art: beats(FG, C.green) },
  { id: "4e", name: "Optimal", why: "One accent in the optimal teal the app uses for in-range states.", art: beats(FG, C.optimal) },
  {
    id: "4f",
    name: "Recovery band",
    why: "One vertical gradient through both beats, red at the base to green at the top, the recovery scale.",
    art: (uid: string) => (
      <>
        <defs>
          <linearGradient id={uid} x1={0} y1={19.5} x2={0} y2={4.5} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={C.red} />
            <stop offset={0.45} stopColor={C.yellow} />
            <stop offset={1} stopColor={C.green} />
          </linearGradient>
        </defs>
        {beats(`url(#${uid})`, `url(#${uid})`)}
      </>
    ),
  },
  {
    id: "4g",
    name: "Cool pair",
    why: "Optimal teal, then strain blue: still the two scores, in two neighbouring cool hues that sit together calmly.",
    art: beats(C.optimal, C.strainText),
  },
]

/** One concept as an icon tile. `fit` scales the art up for unmasked favicon use. */
let seq = 0 // server-rendered only, so a module counter is enough for unique gradient ids

function Tile({ c, size, fit = 1, className }: { c: Concept; size: number; fit?: number; className?: string }) {
  const art = typeof c.art === "function" ? c.art(`mark-${c.id}-${++seq}`) : c.art
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={`Option ${c.id}, ${c.name}`} className={className}>
      <rect width={24} height={24} fill={BG} />
      <g transform={`translate(12 12) scale(${fit}) translate(-12 -12)`}>{art}</g>
    </svg>
  )
}

const SQUIRCLE = "rounded-[22.5%]"

function TabStrip({ items, light }: { items: Concept[]; light?: boolean }) {
  return (
    <div className={`overflow-x-auto rounded-xl ${light ? "bg-[#dee1e6]" : "bg-[#202124]"} px-2 pt-2`}>
      <div className="flex w-max gap-1">
        {items.map((c, i) => (
          <div key={c.id} className="flex flex-col gap-1">
            <span className={`px-3 text-[10px] leading-3 ${light ? "text-black/50" : "text-white/40"}`}>{c.id}</span>
            <div
              className={`flex h-9 w-32 items-center gap-2 rounded-t-lg px-3 text-[12px] leading-4 ${
                i === 0 ? (light ? "bg-white text-black" : "bg-[#35363a] text-white") : light ? "text-black/80" : "text-white/80"
              }`}
            >
              <Tile c={c} size={16} fit={1.15} className="shrink-0 rounded-[3px]" />
              Pulse
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tab strips, a home screen and one card per option at 16, 32, 64, 180 (squircle and circle) and 512 px. */
function Gallery({ items }: { items: Concept[] }) {
  return (
    <>
      <div className="mt-4 flex flex-col gap-3">
        <TabStrip items={items} />
        <TabStrip items={items} light />
      </div>

      <div className="mt-6 w-full max-w-sm rounded-[36px] bg-[linear-gradient(160deg,#3a4750,#161b1f_55%,#0b0d0f)] px-6 py-8">
        <div className="grid grid-cols-4 gap-x-5 gap-y-6">
          {items.map((c) => (
            <div key={c.id} className="flex flex-col items-center gap-1.5">
              <Tile c={c} size={60} className={`${SQUIRCLE} shadow-[0_2px_8px_rgb(0_0_0/0.35)]`} />
              <span className="text-[11px] leading-3 text-white/90">Pulse {c.id}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {items.map((c) => (
          <article key={c.id} className="rounded-2xl bg-card p-5">
            <div className="flex flex-wrap items-end gap-6">
              <Tile c={c} size={16} fit={1.15} className="rounded-[3px]" />
              <Tile c={c} size={32} fit={1.15} className="rounded-[7px]" />
              <Tile c={c} size={64} fit={1.15} className="rounded-[14px]" />
              <Tile c={c} size={180} className={SQUIRCLE} />
              <span className="relative block size-[180px]">
                <Tile c={c} size={180} className="rounded-full" />
                <span className="absolute inset-[10%] rounded-full border border-dashed border-white/35" />
              </span>
            </div>
            <h3 className="mt-4 text-[15px] leading-5 font-semibold">
              <span className="font-numeric tabular-nums">{c.id}.</span> {c.name}
            </h3>
            <p className="mt-0.5 max-w-[65ch] text-sm leading-5 text-foreground-secondary">{c.why}</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm leading-5 text-muted-foreground">512 px, actual size</summary>
              <div className="mt-3 overflow-x-auto">
                <Tile c={c} size={512} className={SQUIRCLE} />
              </div>
            </details>
          </article>
        ))}
      </div>
    </>
  )
}

/** Dev-only: option 4 colour variants, then the 8 round-2 concepts. 404 unless NODE_ENV is development. */
export default function MarksPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 text-foreground md:px-8">
      <h1 className="text-2xl leading-8 font-bold">Mark concepts</h1>
      <p className="mt-1 max-w-[65ch] text-sm leading-5 text-foreground-secondary">
        Option 4 is chosen. 4g is applied to the favicon, the touch icon, the maskable PNGs and Mark.tsx; name another
        variant to switch. The dashed circle on the masked version is the 80% safe zone.
      </p>

      <section className="mt-10">
        <h2 className="text-lg leading-7 font-semibold">4 colour variants</h2>
        <Gallery items={VARIANTS} />
      </section>

      <section className="mt-16">
        <h2 className="text-lg leading-7 font-semibold">Round 2 concepts</h2>
        <Gallery items={CONCEPTS} />
      </section>
    </main>
  )
}
