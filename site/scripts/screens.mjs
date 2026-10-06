// Captures the app's screens as static HTML for the site's device frames, so they render crisp at any size:
//   DATA_SOURCE=demo TZ=Asia/Kolkata pnpm dev -p 3317   (repo root, in another terminal)
//   pnpm screens                                                  (in site/; APP_URL overrides the address)
// Each screen is the app's own rendered DOM (React, Recharts and lucide output, in demo mode with seeded data), opened
// exactly like `pnpm shots` and cleaned of script, links, focus and accessibility hooks (the site shows it inert, as a
// picture). Its stylesheet is the app's own compiled CSS, cut down to the rules these screens use, scoped under
// `.kit`, with viewport breakpoints turned into container queries on the screen and viewport units into screen units.
// Writes src/kit/screens/<device>-<name>.html and src/kit/kit.css; both are committed, so builds never need the app.
//
// Why not render the kit components in Astro: Recharts 3 draws nothing on the server (its charts register their parts
// in effects and measure their box), so every dial and chart came out empty. The browser is the one renderer that
// lays them out exactly as the app does.
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { chromium, DEVICES, SCREENS, demoSession, openScreen, undemo, APP, COACH_APP, coachSession } from "./app.mjs"

const out = (p) => fileURLToPath(new URL(`../src/kit/${p}`, import.meta.url))
mkdirSync(out("screens"), { recursive: true })

// Runs in the page: turns the live document into one static, inert fragment and returns it with its size.
function snapshot({ id, height, phone, part }) {
  // A part (one dial) is lifted out of its page and shown on its own, sized to its box.
  let box = null
  if (part) {
    const el = document.querySelector(part)
    const r = el.getBoundingClientRect()
    document.body.replaceChildren(el)
    scrollTo(0, 0)
    box = { width: Math.ceil(r.width), height: Math.ceil(r.height) }
    // The site counts the dial's number up: the digits get their own element.
    const v = el.querySelector("[data-dial-part=value]")
    const t = v && [...v.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    if (t) {
      const s = document.createElement("span")
      s.dataset.count = t.textContent.trim()
      s.textContent = t.textContent
      t.replaceWith(s)
    }
  }
  const H = box ? box.height : height
  // Not drawn, or drawn by the frame: scripts, styles, portals, announcers, screen-reader text.
  document.querySelectorAll("script, noscript, template, nextjs-portal, next-route-announcer, body link, body style, .sr-only").forEach((e) => e.remove())

  // A scrolled screen: in-flow content moves up by the scroll; stuck headers stay where they show.
  const scroll = Math.round(scrollY)
  if (scroll) {
    for (const e of document.querySelectorAll("body *")) {
      if (getComputedStyle(e).position !== "sticky") continue
      const stuck = e.getBoundingClientRect().top
      e.style.position = "static"
      const flow = e.getBoundingClientRect().top
      e.style.position = ""
      e.style.cssText += `;position:relative;top:${Math.round(stuck - flow)}px`
    }
  }

  // Off-screen or hidden: dropped, so the fragment holds only what the screen shows.
  const drop = []
  for (const e of document.body.querySelectorAll("*")) {
    if (e.closest("svg") && e.tagName.toLowerCase() !== "svg") continue
    const c = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    // On a scrolled screen what scrolled away stays (hidden), or everything below it would move up.
    const above = r.height > 0 && r.bottom <= 0
    if (c.display === "none" || (c.position !== "fixed" && r.top >= H) || (!scroll && (above || c.visibility === "hidden"))) drop.push(e)
  }
  for (const e of drop) if (e.isConnected) e.remove()
  // The Pulse Age orb is an animated canvas: its still frame becomes an image (a soft glow, so raster is fine), at the
  // canvas's own backing size (2x its box, the app's cap), which the site never exceeds once the frame scales it down.
  // The image takes the canvas's box exactly: `max-width: none` because the preflight's `img { max-width: 100% }`
  // (which never applies to a canvas) would clamp the orb's 130% width and leave its 130% height, an egg.
  for (const c of document.querySelectorAll("canvas")) {
    const img = document.createElement("img")
    const r = c.getBoundingClientRect()
    img.src = c.toDataURL("image/webp", 0.85)
    img.className = c.className
    img.setAttribute("style", [c.getAttribute("style"), "max-width:none"].filter(Boolean).join(";"))
    img.width = Math.round(r.width)
    img.height = Math.round(r.height)
    c.replaceWith(img)
  }

  // Form state lives in properties; the snapshot needs it in attributes.
  for (const i of document.querySelectorAll("input")) {
    if (i.type === "checkbox" || i.type === "radio") i.toggleAttribute("checked", i.checked)
    else i.setAttribute("value", i.value)
  }

  // Classes for states a picture never enters (hover, focus, press, disabled, invalid) or for motion and pointer
  // behaviour: dropped, which also drops their CSS. About half of the markup.
  const INERT = /(^|:)(hover|focus|focus-visible|focus-within|active|disabled|aria-invalid|invalid|visited):|^(group-hover|peer-focus|peer-focus-visible|group-focus-visible)[:/]|^(transition|duration|ease|delay|cursor|select|touch|pointer-events|will-change|outline-hidden|outline-none)(-|$)/
  for (const e of document.body.querySelectorAll("[class]")) {
    const svg = e instanceof SVGElement
    const kept = [...e.classList].filter((c) => !INERT.test(c))
    if (svg) e.setAttribute("class", kept.join(" "))
    else e.className = kept.join(" ")
    if (!kept.length) e.removeAttribute("class")
  }

  // Then every class that styles nothing here: each utility is kept only where one of its rules applies at this
  // screen's size and state. Classes with no rules of their own (group markers, library hooks) stay.
  const unescape = (t) => t.replace(/\\([0-9a-f]{1,6} ?|.)/gi, (m, x) => (/^[0-9a-f]{2,6} ?$/i.test(x) ? String.fromCodePoint(parseInt(x, 16)) : x))
  const STATE = (sel) =>
    sel
      .replace(/::?(before|after|backdrop|placeholder|marker|selection|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)(\([^)]*\))?/g, "")
      .replace(/:(hover|focus|focus-visible|focus-within|active|visited|disabled|enabled|checked|indeterminate|open|popover-open|target|user-invalid|invalid|required|read-only|autofill|placeholder-shown)\b/g, "")
  // A selector list split at its top-level commas (not those inside :is(), :where() or attribute values).
  const split = (list) => {
    const out = []
    let depth = 0
    let quote = ""
    let from = 0
    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      if (quote) {
        if (c === "\\") i++
        else if (c === quote) quote = ""
      } else if (c === '"' || c === "'") quote = c
      else if (c === "\\") i++
      else if (c === "(" || c === "[") depth++
      else if (c === ")" || c === "]") depth--
      else if (c === "," && depth === 0) out.push(list.slice(from, i)), (from = i + 1)
    }
    return [...out, list.slice(from)].map((x) => x.trim())
  }
  const own = new Map() // class -> [{ sel, ok }] for rules whose first compound starts with that class
  const index = (list, ok) => {
    for (const r of list) {
      if (r instanceof CSSStyleRule) {
        for (const sel of split(r.selectorText)) {
          const m = /^\s*\.((?:\\.|[^\s.:#[>+~,()\\])+)/.exec(sel)
          if (!m) continue
          const c = unescape(m[1])
          if (!own.has(c)) own.set(c, [])
          own.get(c).push({ sel: STATE(sel.trim()), ok })
        }
      } else if (r instanceof CSSMediaRule) index(r.cssRules, ok && matchMedia(r.conditionText).matches)
      else if (r.cssRules) index(r.cssRules, ok)
    }
  }
  for (const s of document.styleSheets) {
    try {
      index(s.cssRules, true)
    } catch {}
  }
  // True when the selector's subject is not its first compound (a descendant, child or sibling of it).
  const combined = (sel) => {
    let depth = 0
    for (let i = 0; i < sel.length; i++) {
      const c = sel[i]
      if (c === "\\") i++
      else if (c === "(" || c === "[") depth++
      else if (c === ")" || c === "]") depth--
      else if (depth === 0 && /[\s>+~]/.test(c)) return true
    }
    return false
  }
  const applies = (e, { sel, ok }) => {
    if (!ok) return false
    try {
      return combined(sel) ? !!document.querySelector(sel) : e.matches(sel)
    } catch {
      return true
    }
  }
  for (const e of document.body.querySelectorAll("[class]")) {
    const kept = [...e.classList].filter((c) => !own.has(c) || own.get(c).some((r) => applies(e, r)))
    if (kept.length === e.classList.length) continue
    if (e instanceof SVGElement) e.setAttribute("class", kept.join(" "))
    else e.className = kept.join(" ")
    if (!kept.length) e.removeAttribute("class")
  }

  // Headings and landmarks become plain boxes: the site page has its own outline, and a screen inside it must not add
  // a second <main> or a stray <h1> for crawlers. The app's CSS styles none of these by tag beyond what a div has.
  for (const e of [...document.body.querySelectorAll("h1, h2, h3, h4, h5, h6, main, header, nav, footer, aside, section, article, form, dialog")]) {
    const d = document.createElement("div")
    for (const a of e.attributes) d.setAttribute(a.name, a.value)
    d.append(...e.childNodes)
    e.replaceWith(d)
  }
  for (const i of document.body.querySelectorAll("img")) i.setAttribute("alt", "")

  // Ids are made unique per screen (gradients and clip paths refer to them).
  const ids = new Map()
  for (const e of document.body.querySelectorAll("[id]")) {
    const next = `${id}-${e.id.replace(/[^\w-]/g, "")}`
    ids.set(e.id, next)
    e.id = next
  }
  const refs = (v) => v.replace(/url\(#([^)]+)\)/g, (m, x) => (ids.has(x) ? `url(#${ids.get(x)})` : m)).replace(/^#(.+)$/, (m, x) => (ids.has(x) ? `#${ids.get(x)}` : m))

  // Attributes: keep what draws (class, style, data-* for state selectors, SVG geometry); drop links, handlers, focus
  // and accessibility hooks, since the whole screen is one decorative picture.
  const DROP = /^(on|aria-|role$|tabindex$|href$|for$|title$|name$|autocomplete$|action$|method$|target$|rel$|draggable$|spellcheck$|translate$|popover|inert$|lang$|dir$|type$|xmlns$|focusable$|nonce$)/
  for (const e of [document.body, ...document.body.querySelectorAll("*")]) {
    const svg = e instanceof SVGElement
    for (const a of [...e.attributes]) {
      const n = a.name
      if (n === "href" && svg) e.setAttribute(n, refs(a.value))
      else if (DROP.test(n) && !(svg && n === "type")) e.removeAttribute(n)
      else if (/url\(#/.test(a.value)) e.setAttribute(n, refs(a.value))
    }
  }

  const keep = (cls) => cls.split(/\s+/).filter((c) => c && !/__variable|^h-full$|^scroll-/.test(c)).join(" ")
  const W = box ? box.width : innerWidth
  const bodyStyle = [document.body.getAttribute("style"), scroll && `margin-top:-${scroll}px`].filter(Boolean).join(";")
  const data = [...document.body.attributes].filter((a) => a.name.startsWith("data-")).map((a) => ` ${a.name}="${a.value}"`).join("")
  const html = `<div class="kit${box ? " kit-part" : ""} ${[...document.documentElement.classList].filter((c) => c === "dark" || c === "antialiased").join(" ")}" style="--kit-w:${W}px;--kit-h:${H}px"><div class="kit-body ${keep(document.body.className)}"${bodyStyle ? ` style="${bodyStyle}"` : ""}${data}>${document.body.innerHTML}</div></div>`
  return { html, width: W, height: H }
}

// Runs in the page after `snapshot`: every CSS rule that matches something left in the document, with the path of
// at-rules around it and its position in the stylesheet (so rules merged from several screens keep the app's order).
function rules() {
  const found = []
  // A selector list split at its top-level commas (not those inside :is(), :where() or attribute values).
  const split = (list) => {
    const out = []
    let depth = 0
    let quote = ""
    let from = 0
    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      if (quote) {
        if (c === "\\") i++
        else if (c === quote) quote = ""
      } else if (c === '"' || c === "'") quote = c
      else if (c === "\\") i++
      else if (c === "(" || c === "[") depth++
      else if (c === ")" || c === "]") depth--
      else if (c === "," && depth === 0) out.push(list.slice(from, i)), (from = i + 1)
    }
    return [...out, list.slice(from)].map((x) => x.trim())
  }

  const strip = (s) =>
    s
      .replace(/::?(before|after|backdrop|placeholder|marker|selection|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)(\([^)]*\))?/g, "")
      .replace(/:(hover|focus|focus-visible|focus-within|active|visited|disabled|enabled|checked|indeterminate|open|popover-open|target|user-invalid|invalid|required|read-only|autofill|placeholder-shown)\b/g, "")
  const matches = (sel) => {
    try {
      const t = strip(sel).trim()
      return !t || !!document.querySelector(t)
    } catch {
      return true
    }
  }
  const walk = (list, path, pos) => {
    ;[...list].forEach((r, i) => {
      const p = [...pos, i]
      if (r instanceof CSSFontFaceRule) return
      if (r instanceof CSSStyleRule) {
        if (/__variable/.test(r.selectorText)) return
        const sels = split(r.selectorText).filter(matches)
        if (sels.length) found.push({ path, pos: p, sels, body: r.style.cssText, nested: r.cssRules?.length ? [...r.cssRules].map((x) => x.cssText).join("") : "" })
      } else if (r instanceof CSSLayerStatementRule) found.push({ path, pos: p, raw: r.cssText })
      else if (r instanceof CSSKeyframesRule || r instanceof CSSPropertyRule) found.push({ path: [], pos: p, raw: r.cssText })
      else if (r instanceof CSSLayerBlockRule) walk(r.cssRules, [...path, `@layer ${r.name}`], p)
      else if (r instanceof CSSMediaRule) walk(r.cssRules, [...path, `@media ${r.conditionText}`], p)
      else if (r instanceof CSSSupportsRule) walk(r.cssRules, [...path, `@supports ${r.conditionText}`], p)
      else if (r instanceof CSSContainerRule) walk(r.cssRules, [...path, `@container ${r.containerName ? r.containerName + " " : ""}${r.containerQuery}`], p)
    })
  }
  ;[...document.styleSheets].forEach((s, i) => {
    try {
      walk(s.cssRules, [], [s.href ?? `inline-${i}`])
    } catch {}
  })
  return found
}

// Scoping: the app's document root becomes `.kit`, its body `.kit-body`, everything else lives under `.kit`.
const scope = (sel) => {
  if (/^(:root|html|:host)\b/.test(sel)) return sel.replace(/^(:root|html|:host)/, ".kit")
  if (/^body\b/.test(sel)) return sel.replace(/^body/, ".kit-body")
  return `.kit ${sel}`
}
// Viewport units become units of the screen (the frame's 390 x 794 or 1440 x 900), set on `.kit`.
const units = (body) => body.replace(/(-?\d*\.?\d+)(?:d|s|l)?v(h|w)\b/g, (_, n, a) => `calc(var(--kit-v${a}) * ${n})`)
// Breakpoints answer to the screen's width, not the site's window.
const atRule = (a) => (/^@media .*\bwidth\b/.test(a) ? a.replace(/^@media/, "@container kit") : a)

// The three dials, each the hero of its own phone screen, for the landing page's dial row.
const PARTS = [
  ["dial-sleep", "/sleep"],
  ["dial-recovery", "/recovery"],
  ["dial-strain", "/strain"],
]

// The colour at the top centre of the screen, which the frame's status bar takes so it runs on into the app's header
// (a screen's ground differs: Health is flat, Home has the slate top light).
const topColor = async (page) => {
  const png = await page.screenshot({ clip: { x: 195, y: 1, width: 1, height: 1 }, scale: "css" })
  const [r, g, b] = await sharp(png).removeAlpha().raw().toBuffer()
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

const all = new Map() // every kept CSS rule, by its place in the app's stylesheets
const save = async (page, name, shot, top) => {
  if (top) shot.html = shot.html.replace('style="--kit-w:', `style="--kit-top:${top};--kit-w:`)
  for (const r of await page.evaluate(rules)) {
    const key = r.raw ?? r.pos.join("/")
    const prev = all.get(key)
    if (prev && r.sels) prev.sels = [...new Set([...prev.sels, ...r.sels])]
    else if (!prev) all.set(key, { ...r })
  }
  writeFileSync(out(`screens/${name}.html`), shot.html)
  console.log(`wrote src/kit/screens/${name}.html (${shot.width} x ${shot.height}, ${Math.round(shot.html.length / 1024)} KB)`)
}

const token = await demoSession()
const browser = await chromium.launch()
for (const [kind, opts] of Object.entries(DEVICES)) {
  const ctx = await browser.newContext({ ...opts, timezoneId: "Asia/Kolkata", reducedMotion: "reduce", colorScheme: "dark" })
  await ctx.addCookies([{ name: "better-auth.session_token", value: token, url: APP }])
  const page = await ctx.newPage()
  for (const screen of SCREENS) {
    const name = `${kind}-${screen[0]}`
    const height = await openScreen(page, kind, screen)
    const top = kind === "phone" ? await topColor(page) : null
    await save(page, name, await page.evaluate(snapshot, { id: name, height, phone: kind === "phone" }), top)
  }
  if (kind === "phone")
    for (const [name, path] of PARTS) {
      await page.setViewportSize(opts.viewport)
      await page.goto(APP + path, { waitUntil: "networkidle" })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      await page.evaluate(undemo)
      await save(page, name, await page.evaluate(snapshot, { id: name, phone: true, part: "[data-dial]" }))
    }
  await ctx.close()
}
// The coach, which a demo instance never offers: captured from a Google-mode app with the scripted test model and the
// seeded demo account (see app.mjs). One question, its tool card and the answer. Skipped without COACH_APP_URL.
if (COACH_APP) {
  const coach = await coachSession()
  for (const [kind, opts] of Object.entries(DEVICES)) {
    const ctx = await browser.newContext({ ...opts, timezoneId: "Asia/Kolkata", reducedMotion: "reduce", colorScheme: "dark" })
    await ctx.addCookies([{ name: "better-auth.session_token", value: coach, url: COACH_APP }])
    const page = await ctx.newPage()
    await page.goto(`${COACH_APP}/coach`, { waitUntil: "networkidle" })
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1500) // hydrated, so the chip sends
    // The answer streams in (and is mirrored to a live region for screen readers, so wait on the text, not a node).
    // A freshly started dev server can drop the first answer, so ask again from a new chat, up to three times.
    for (let i = 0; ; i++) {
      await page.getByRole("button", { name: /^Why is my recovery/ }).click() // the chip, not a chat in the list
      const ok = await page.waitForFunction(() => document.body.innerText.includes("usual bedtime"), null, { timeout: 15000 }).then(() => true, () => false)
      if (ok) break
      if (i === 2) throw new Error("The coach never answered")
      await page.goto(`${COACH_APP}/coach`, { waitUntil: "networkidle" })
      await page.waitForTimeout(1500)
    }
    await page.waitForTimeout(1500)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(800)
    await page.mouse.move(0, 0)
    const name = `${kind}-coach`
    const top = kind === "phone" ? await topColor(page) : null
    await save(page, name, await page.evaluate(snapshot, { id: name, height: opts.viewport.height, phone: kind === "phone" }), top)
    await ctx.close()
  }
}
await browser.close()

// Rebuild one stylesheet in the app's order, each rule inside its at-rules, the whole of it in the `kit` layer.
const cmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1
    if (b[i] === undefined) return 1
    if (a[i] !== b[i]) return typeof a[i] === "string" ? String(a[i]).localeCompare(String(b[i])) : a[i] - b[i]
  }
  return 0
}
const list = [...all.values()].sort((a, b) => cmp(a.pos, b.pos))
let css = ""
let open = []
const head = []
for (const r of list) {
  if (r.raw && r.path.length === 0 && !r.raw.startsWith("@layer")) {
    head.push(r.raw)
    continue
  }
  const path = r.path.map(atRule)
  let same = 0
  while (same < open.length && same < path.length && open[same] === path[same]) same++
  css += "}".repeat(open.length - same)
  for (const a of path.slice(same)) css += `${a}{`
  open = path
  css += r.raw ?? `${r.sels.map(scope).join(",")}{${units(r.body)}${r.nested}}`
  css += "\n"
}
css += "}".repeat(open.length)
const banner = `/* Generated by \`pnpm screens\` from the app's compiled CSS: do not edit. See scripts/screens.mjs. */\n`
// Fonts: the site's own Figtree and Barlow files; the screen is a size container that the breakpoints query.
const base = `@layer site, kit;\n@layer kit{.kit-part{background:none}.kit-part .kit-body::before{content:none}.kit{--font-sans:"Figtree Variable",ui-sans-serif,system-ui,sans-serif;--font-numeric:"Barlow","Figtree Variable",sans-serif;--kit-vh:calc(var(--kit-h) / 100);--kit-vw:calc(var(--kit-w) / 100);container:kit/inline-size;position:relative;width:var(--kit-w);height:var(--kit-h);overflow:hidden;contain:strict;text-align:left}}\n`
writeFileSync(out("kit.css"), `${banner}${head.join("\n")}\n${base}@layer kit{\n${css}}\n`)
console.log(`wrote src/kit/kit.css (${Math.round(css.length / 1024)} KB)`)
