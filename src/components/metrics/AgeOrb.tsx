"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "@/hooks/use-theme"
import { cn } from "@/lib/utils"
import { AGE_LABEL, formatValue } from "@/lib/format"
import { reasonCopy, type ReasonCode } from "@/lib/reasons"
import { blobRadius, css, cssMix, easeOutCubic, hexRGB, mixRGB, ORB, orbColors, orbStops, particleCount, rng, shadeRGB, type RGB, type Token } from "@/lib/orb"
import { ageDelta } from "@/app/(app)/health/format"
import { MetricTags } from "@/components/metrics/primitives"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"

export type AgeOrbProps = {
  /** Pulse Age, the number in the middle. */
  age: number | null
  /** Pulse Age minus chronological age; positive is older. */
  deltaYears: number | null
  provisional?: boolean
  /** Box size in CSS px (default 300, compact 108). Below 160 it drops the delta line (Health hub, collapsed header). */
  size?: number
  reason?: ReasonCode | null
  /**
   * The sticky header's mini orb (docs/design/sticky.md B2, [latest-healthspan-collapsed-1..5]): same colours,
   * the age and label inside, one settled frame (no loop, no touch), `aria-hidden` and `inert`.
   */
  compact?: boolean
}

/** Canvas overhang on each side, as a share of `size`, so the glow can bleed past the box. */
const PAD = 0.15
/** Vertical colour bands the particle sprites are pre-tinted in (mixed orbs fade top to bottom). */
const BANDS = 8
const STEPS = 128
const ENTER = "motion-safe:transition-[opacity,filter,translate] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:starting:translate-y-1 motion-safe:starting:opacity-0 motion-safe:starting:blur-[4px]"

/** A colour token's value, read where the orb is drawn (globals.css holds every colour). */
const tokenRGB = (el: Element, token: Token): RGB => hexRGB(getComputedStyle(el).getPropertyValue(token))

function offscreen(px: number, dpr: number) {
  const c = document.createElement("canvas")
  c.width = c.height = Math.ceil(px * dpr)
  const g = c.getContext("2d")!
  g.scale(dpr, dpr)
  return [c, g] as const
}

function sprite(color: RGB, soft: boolean) {
  const [c, g] = offscreen(soft ? 64 : 16, 1)
  const r = c.width / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  const stops: [number, number][] = soft
    ? [[0, 0.5], [0.55, 0.42], [0.82, 0.2], [1, 0]]
    : [[0, 1], [0.4, 1], [0.62, 0.3], [1, 0]]
  for (const [at, a] of stops) grad.addColorStop(at, css(color, a))
  g.fillStyle = grad
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/**
 * Pulse Age hero (docs/design/orb.md): a noise-edged blob of glowing particles on a 2D canvas, coloured by how much
 * older or younger Pulse Age is. Particles gather in on mount, drift at idle, and pull inward and swirl while pressed.
 * Server render and no-canvas fallback: a static gradient blob with the same numerals.
 */
export function AgeOrb({ age, deltaYears, provisional = false, size: sizeProp, reason, compact = false }: AgeOrbProps) {
  const size = sizeProp ?? (compact ? 108 : 300)
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  // The orb's tokens differ by theme; a theme change redraws it.
  const { resolvedTheme } = useTheme()

  const has = age !== null && deltaYears !== null
  const delta = has ? deltaYears : null
  const small = size < 160
  const d = delta !== null ? ageDelta(delta) : null
  const same = d !== null && delta !== null && formatValue("decimal1", Math.abs(delta)) === "0.0"
  const stops = orbStops(delta)
  const top = cssMix(stops.top, stops.t)
  const bottom = cssMix(stops.bottom, stops.t)
  const r = reasonCopy(reason)

  const label = has
    ? `${AGE_LABEL} ${formatValue("decimal1", age)}, ${same ? "same as your age" : `${d!.text} than your age`}${provisional ? ", provisional" : ""}`
    : `${AGE_LABEL} unavailable. ${r.long}`

  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !box || !ctx) return // No canvas: the CSS fallback stays.

    const rgb = (token: Token) => tokenRGB(box, token)
    const { top, bottom } = orbColors(delta, rgb)
    const style = getComputedStyle(box)
    const HIGHLIGHT = rgb("--orb-highlight")
    const CORE = rgb("--orb-core")
    const LIFT = Number.parseFloat(style.getPropertyValue("--orb-lift")) || 1.3
    const BLEND: GlobalCompositeOperation = style.getPropertyValue("--orb-blend").trim() === "source-over" ? "source-over" : "lighter"
    // Below 1 a tone fades toward the core (black on dark, so the same as darkening); above 1 it brightens.
    const tone = (c: RGB, k: number) => (k <= 1 ? mixRGB(CORE, c, k) : shadeRGB(c, k))
    const SPARKLE = Number.parseFloat(style.getPropertyValue("--orb-sparkle"))
    const bright = (c: RGB) => mixRGB(shadeRGB(c, LIFT), HIGHLIGHT, Number.isFinite(SPARKLE) ? SPARKLE : 0.12)
    const dim = delta === null ? 0.55 : 1
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    const dpr = Math.min(window.devicePixelRatio || 1, ORB.maxDpr)
    const W = size * (1 + 2 * PAD)
    const cx = W / 2
    const cy = W / 2
    const R = (size / 2) * ORB.shape.radius
    canvas.width = canvas.height = Math.round(W * dpr)
    const seed = 3 + (Math.abs(Math.round((delta ?? 0) * 10)) % 89)

    // Static layers, built once: the body (rim colour fading to a black core) and the outer glow.
    const fill = (g: CanvasRenderingContext2D, k: number, a = 1) => {
      const lin = g.createLinearGradient(0, cy - R, 0, cy + R)
      lin.addColorStop(0, css(tone(top, k), a))
      lin.addColorStop(1, css(tone(bottom, k), a))
      return lin
    }
    const [body, bg] = offscreen(W, dpr)
    bg.fillStyle = fill(bg, ORB.fillShade)
    bg.fillRect(0, 0, W, W)
    const core = bg.createRadialGradient(cx, cy, 0, cx, cy, R * 1.04)
    for (const [at, a] of [[0, 1], [0.42, 1], [0.6, 0.72], [0.76, 0.38], [0.9, 0.12], [1, 0]]) core.addColorStop(at, css(CORE, a))
    bg.fillStyle = core
    bg.fillRect(0, 0, W, W)

    const [glow, gg] = offscreen(W, dpr)
    gg.fillStyle = fill(gg, 0.8)
    gg.fillRect(0, 0, W, W)
    gg.globalCompositeOperation = "destination-in"
    const halo = gg.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.36)
    for (const [at, a] of [[0, 0.36], [0.35, 0.22], [0.6, 0.07], [1, 0]]) halo.addColorStop(at, css(CORE, a * dim))
    gg.fillStyle = halo
    gg.fillRect(0, 0, W, W)

    // Inner rim light: stacked clipped strokes, widest faintest, so the band brightens toward the edge with no step.
    const rim = [0.24, 0.16, 0.1, 0.06, 0.03].map((w, i) => [R * w, fill(ctx, 1 + i * 0.04, (0.07 + i * 0.03) * dim)] as const)
    const lin = ctx.createLinearGradient(0, cy - R, 0, cy + R)
    lin.addColorStop(0, css(mixRGB(top, HIGHLIGHT, 0.22), 0.85 * dim))
    lin.addColorStop(1, css(mixRGB(bottom, HIGHLIGHT, 0.22), 0.85 * dim))

    const tint = Array.from({ length: BANDS }, (_, b) => bright(mixRGB(top, bottom, b / (BANDS - 1))))
    const sprites = [tint.map((c) => sprite(c, false)), tint.map((c) => sprite(c, true))]

    // Particles: home angle and depth (denser toward the rim), a scattered start, drift and twinkle.
    const n = Math.round(particleCount(size) * (delta === null ? 0.5 : 1))
    const rand = rng(seed * 7919)
    const k = Math.min(1.2, Math.max(0.75, size / 300))
    const P = {
      th: new Float32Array(n), rho: new Float32Array(n), rhoIn: new Float32Array(n), w: new Float32Array(n),
      ph: new Float32Array(n), tw: new Float32Array(n), depth: new Float32Array(n), rad: new Float32Array(n),
      alpha: new Float32Array(n), soft: new Uint8Array(n), sx: new Float32Array(n), sy: new Float32Array(n),
      delay: new Float32Array(n), swirl: new Float32Array(n),
    }
    const [dust, dots] = ORB.particles.mix
    for (let i = 0; i < n; i++) {
      const kind = rand()
      const u = rand()
      const bokeh = kind >= dust + dots
      P.th[i] = rand() * Math.PI * 2
      P.rho[i] = bokeh ? 0.92 - 0.45 * u ** 1.4 : 0.965 - 0.62 * u ** 1.7
      P.rhoIn[i] = rand() < 0.3 ? P.rho[i] : 0.18 + 0.55 * rand() // A third stay on the rim, as in the touch frames.
      P.w[i] = (0.012 + 0.03 * rand()) * (rand() < 0.75 ? 1 : -1)
      P.ph[i] = rand() * Math.PI * 2
      P.tw[i] = 0.6 + 1.8 * rand()
      P.soft[i] = bokeh ? 1 : 0
      if (kind < dust) [P.rad[i], P.alpha[i], P.depth[i]] = [(0.35 + 0.4 * rand()) * k, 0.12 + 0.28 * rand(), 0.6]
      else if (!bokeh) [P.rad[i], P.alpha[i], P.depth[i]] = [(0.9 + 1 * rand()) * k, 0.55 + 0.45 * rand(), 0.35]
      else [P.rad[i], P.alpha[i], P.depth[i]] = [(2.2 + 2.6 * rand()) * k, 0.2 + 0.25 * rand(), 0.25]
      const a = rand() * Math.PI * 2
      const dist = R * 1.4 * Math.sqrt(rand())
      P.sx[i] = cx + dist * Math.cos(a)
      P.sy[i] = cy + dist * Math.sin(a)
      P.delay[i] = rand() * ORB.entry.maxDelay
      P.swirl[i] = 0.6 + 0.8 * rand()
    }

    const rTab = new Float32Array(STEPS + 1)
    const fly = ORB.entry.duration - ORB.entry.maxDelay
    let gather = 0
    let target = 0
    let swirl = 0
    let ax = 0
    let ay = 0

    function draw(t: number, dt: number) {
      gather += (target - gather) * (1 - Math.exp(-dt * ORB.touch.ease))
      swirl += dt * gather * ORB.touch.swirl
      // The body is there from frame 0 (it replaces the CSS fallback); rim and glow charge up as particles land.
      const eb = 0.45 + 0.55 * easeOutCubic(t / ORB.entry.duration)
      const wob = 1 + gather * ORB.touch.wobble
      const rr = R
      // While pressed the outline also leans out toward the finger (touch frames).
      const pull = Math.hypot(ax, ay) > 4 ? gather * ORB.touch.bulge : 0
      const toward = Math.atan2(ay, ax)
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2
        rTab[i] = rr * blobRadius(a, t, seed, small, wob) * (1 + pull * Math.max(0, Math.cos(a - toward)) ** 4)
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.globalCompositeOperation = "source-over"
      ctx!.clearRect(0, 0, W, W)
      ctx!.globalAlpha = eb * (1 + 0.25 * gather)
      ctx!.drawImage(glow, 0, 0, W, W)

      const path = new Path2D()
      for (let i = 0; i < STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2
        path[i ? "lineTo" : "moveTo"](cx + rTab[i] * Math.cos(a), cy + rTab[i] * Math.sin(a))
      }
      path.closePath()

      ctx!.save()
      ctx!.clip(path)
      ctx!.globalAlpha = dim
      ctx!.drawImage(body, 0, 0, W, W)
      ctx!.globalAlpha = eb
      for (const [w, style] of rim) {
        ctx!.lineWidth = w
        ctx!.strokeStyle = style
        ctx!.stroke(path)
      }
      ctx!.restore()
      ctx!.lineWidth = 1.25
      ctx!.strokeStyle = lin
      ctx!.stroke(path)

      ctx!.globalCompositeOperation = BLEND
      const lift = (1 + 0.3 * gather) * dim
      for (let i = 0; i < n; i++) {
        const e = easeOutCubic((t - P.delay[i]) / fly)
        if (e <= 0) continue
        const th = P.th[i] + P.w[i] * t + swirl * P.swirl[i] - (1 - e) * 0.9
        const rho = P.rho[i] + 0.012 * Math.sin(P.ph[i] + t * 0.7)
        const depth = rho + (P.rhoIn[i] - rho) * gather
        const ang = ((th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        const edge = rTab[Math.round((ang / (Math.PI * 2)) * STEPS)]
        const lean = gather * (1 - depth) // Inner particles lean toward the finger; rim ones stay inside the edge.
        const hx = cx + edge * depth * Math.cos(th) + ax * lean
        const hy = cy + edge * depth * Math.sin(th) + ay * lean
        const x = P.sx[i] + (hx - P.sx[i]) * e
        const y = P.sy[i] + (hy - P.sy[i]) * e
        const tw = 1 - P.depth[i] + P.depth[i] * (0.5 + 0.5 * Math.sin(P.ph[i] * 3.1 + t * P.tw[i]))
        ctx!.globalAlpha = Math.min(1, P.alpha[i] * tw * (0.4 + 0.6 * P.rho[i] * P.rho[i]) * e * lift)
        const band = Math.min(BANDS - 1, Math.max(0, Math.floor(((y - cy + R) / (2 * R)) * BANDS)))
        const s = P.rad[i] * (P.soft[i] ? 2 : 2.6)
        ctx!.drawImage(sprites[P.soft[i]][band], x - s / 2, y - s / 2, s, s)
      }
      ctx!.globalAlpha = 1
    }

    const hideFallback = () => fallbackRef.current?.style.setProperty("opacity", "0")
    // The compact orb lives in the header beside the full one: a settled frame costs nothing per scroll frame.
    if (reduced || compact) {
      draw(10, 0) // One settled frame, no loop.
      hideFallback()
      return
    }

    let raf = 0
    let last = 0
    let t = 0
    let running = false
    let active = 0 // Last interaction or entry, in orb time.
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      draw(t, dt)
      // WCAG 2.2.2: ambient motion settles after a while; a touch or scrolling back wakes it.
      if (t - active > ORB.idleSeconds && gather < 0.01) return stop()
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      active = t
      if (running) return
      running = true
      canvas.dataset.running = "true"
      last = performance.now()
      if (t === 0) {
        draw(0, 0)
        hideFallback()
      }
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      running = false
      canvas.dataset.running = "false"
      cancelAnimationFrame(raf)
    }
    let onScreen = false
    const sync = () => (onScreen && !document.hidden ? start() : stop())
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      sync()
    })
    io.observe(box)
    document.addEventListener("visibilitychange", sync)

    // Press and hold: particles pull toward the centre, leaning toward the finger, and swirl.
    const aim = (ev: PointerEvent) => {
      const b = box.getBoundingClientRect()
      ax = (ev.clientX - b.left - size / 2) * 0.5
      ay = (ev.clientY - b.top - size / 2) * 0.5
    }
    const down = (ev: PointerEvent) => {
      target = 1
      aim(ev)
      if (onScreen) start()
    }
    const move = (ev: PointerEvent) => target && aim(ev)
    const up = () => {
      target = 0
      active = t
    }
    box.addEventListener("pointerdown", down)
    box.addEventListener("pointermove", move)
    for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) box.addEventListener(type, up)

    return () => {
      stop()
      io.disconnect()
      document.removeEventListener("visibilitychange", sync)
      box.removeEventListener("pointerdown", down)
      box.removeEventListener("pointermove", move)
      for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) box.removeEventListener(type, up)
    }
  }, [delta, size, small, compact, resolvedTheme])

  return (
    <div
      ref={boxRef}
      role={compact ? undefined : "img"}
      aria-label={compact ? undefined : label}
      aria-hidden={compact || undefined}
      inert={compact}
      className="relative isolate shrink-0 touch-pan-y select-none [-webkit-tap-highlight-color:transparent]"
      style={
        {
          width: size,
          height: size,
          "--s": `${size}px`,
          // The canvas's shading as CSS mixes of the same tokens, for the server render and no-canvas fallback.
          "--orb-top": `color-mix(in srgb, ${top} ${ORB.fillShade * 100}%, var(--orb-core))`,
          "--orb-bottom": `color-mix(in srgb, ${bottom} ${ORB.fillShade * 100}%, var(--orb-core))`,
          "--orb-edge": `color-mix(in srgb, color-mix(in srgb, ${top} 78%, var(--orb-highlight)) ${has ? 85 : 45}%, transparent)`,
          "--orb-glow": `color-mix(in srgb, ${top} ${has ? 35 : 15}%, transparent)`,
        } as React.CSSProperties
      }
    >
      <div
        ref={fallbackRef}
        aria-hidden
        className={cn(
          "absolute inset-[5%] rounded-[48%_52%_47%_53%/53%_47%_53%_47%] ring-1 ring-(--orb-edge)",
          "bg-[radial-gradient(closest-side,var(--orb-core)_48%,transparent_104%),linear-gradient(var(--orb-top),var(--orb-bottom))]",
          "shadow-[0_0_calc(var(--s)*0.12)_var(--orb-glow)]",
          !has && "opacity-60"
        )}
      />
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute -top-[15%] -left-[15%] size-[130%]" />
      <div aria-hidden className="relative grid size-full place-content-center justify-items-center px-[14%] text-center">
        <span
          className={cn(
            "font-numeric leading-none font-bold tracking-[-0.01em] tabular-nums motion-safe:delay-200",
            small ? "text-[calc(var(--s)*0.25)]" : "text-[calc(18px+var(--s)*0.07)]",
            has ? "text-(--orb-text)" : "text-(--orb-text-muted)",
            !compact && ENTER
          )}
        >
          {formatValue("decimal1", has ? age : null)}
        </span>
        <span
          className={cn(
            "font-bold tracking-[0.1em] text-(--orb-text-muted) uppercase motion-safe:delay-300",
            small ? "mt-0.5 text-[max(9px,calc(var(--s)*0.09))] leading-none" : "mt-1.5 text-[calc(7px+var(--s)*0.023)] leading-tight",
            !compact && ENTER
          )}
        >
          {AGE_LABEL}
        </span>
        {!small && d && (
          <span
            className={cn("mt-2.5 text-[calc(8px+var(--s)*0.024)] leading-tight font-semibold tabular-nums motion-safe:delay-400", delta! <= ORB.greenText ? "text-optimal-text" : same && "text-(--orb-text-muted)", ENTER)}
            style={delta! > ORB.greenText && !same ? { color: `var(${ORB.deltaText})` } : undefined}
          >
            {d.text}
          </span>
        )}
        {!small && !has && <ReasonPlaceholder reason={reason} size="sm" className={cn("mt-3 justify-center text-balance motion-safe:delay-400", ENTER)} />}
        {!small && has && provisional && <MetricTags provisional className={cn("mt-3 motion-safe:delay-500", ENTER)} />}
      </div>
    </div>
  )
}
