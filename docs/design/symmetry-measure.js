// Symmetry pass measurement (docs/design/ux-audit-desktop.md, "Symmetry pass").
// Paste the function into the browser MCP's evaluate_script on any page of the dev server (same origin).
// Set window.__SYM_ROUTES / window.__SYM_WIDTHS first to measure a subset.
// It loads every route at every width in a hidden iframe and returns one row per (route, width) with only the flags.
/* eslint-disable @typescript-eslint/no-unused-expressions -- a bare function for evaluate_script */
async () => {
  const ROUTES = window.__SYM_ROUTES || ["/", "/recovery", "/strain", "/sleep", "/activity/seed-ex-2026-09-24-0", "/health", "/health/healthspan", "/health/monitor", "/health/stress", "/health/fitness", "/journal", "/journal/insights", "/reports/2026-W39", "/reports/2026-09", "/more", "/settings"]
  const WIDTHS = window.__SYM_WIDTHS || [361, 390, 820, 1280, 1440, 1600, 1920]
  const TOL = { edge: 1, top: 4, height: 24, empty: 120 }
  const r0 = (n) => Math.round(n)

  function analyse(doc, win) {
    const de = doc.documentElement
    const col = doc.querySelector("main [class*='mx-auto w-full min-w-0']")
    if (!col) return { error: "no content column" }
    const cs = win.getComputedStyle(col)
    const cr = col.getBoundingClientRect()
    const L = cr.left + parseFloat(cs.paddingLeft)
    const R = cr.right - parseFloat(cs.paddingRight)
    const vis = (el) => {
      const b = el.getBoundingClientRect()
      return b.width > 0 && b.height > 0 && win.getComputedStyle(el).visibility !== "hidden"
    }
    const isCard = (el) => el.matches("[data-slot=card], [class*='rounded-2xl']") && vis(el) && el.getBoundingClientRect().width >= 120 && el.getBoundingClientRect().height >= 40
    const cards = [...col.querySelectorAll("*")].filter((el) => isCard(el) && !el.parentElement.closest("[data-slot=card], [class*='rounded-2xl']"))
    const flags = []

    // 1. Edges: every outermost card inside the column.
    for (const c of cards) {
      const b = c.getBoundingClientRect()
      if (b.left < L - TOL.edge || b.right > R + TOL.edge) flags.push(`edge: card "${label(c)}" ${r0(b.left - L)}/${r0(R - b.right)} px past the column`)
    }

    // 2. Full-width strips (DayStrip): first and last tile against the column edges.
    for (const vp of col.querySelectorAll("[data-slot=scroll-area-viewport]")) {
      const items = vp.querySelectorAll("button")
      if (items.length < 5) continue
      const v = vp.getBoundingClientRect()
      const first = items[0].getBoundingClientRect().left + vp.scrollLeft - v.left
      const last = items[items.length - 1].getBoundingClientRect().right + vp.scrollLeft - v.left
      const dl = r0(v.left + first - L)
      const dr = r0(vp.scrollWidth > vp.clientWidth + 1 ? R - (v.right - (vp.scrollWidth - last)) : R - (v.left + last))
      if (Math.abs(dl) > TOL.edge || Math.abs(dr) > TOL.edge) flags.push(`strip: tiles inset ${dl} px left, ${dr} px right of the column`)
    }

    // 3. Multi-column rows: any container whose visible children form 2+ columns of 200+ px wide blocks.
    const rows = []
    for (const el of col.querySelectorAll("*")) {
      const kids = [...el.children].filter((k) => vis(k) && k.getBoundingClientRect().width >= 200 && k.getBoundingClientRect().height >= 40)
      if (kids.length < 2) continue
      if (!kids.some((k) => isCard(k) || k.querySelector("[data-slot=card], [class*='rounded-2xl'], section"))) continue
      const xs = [...new Set(kids.map((k) => r0(k.getBoundingClientRect().left)))]
      if (xs.length < 2) continue
      rows.push({ el, kids })
    }
    for (const { el, kids } of rows) {
      const eb = el.getBoundingClientRect()
      const name = label(el)
      // Group children into visual rows by overlapping vertical ranges.
      const sorted = kids.map((k) => ({ k, b: k.getBoundingClientRect() })).sort((a, b) => a.b.top - b.b.top)
      const groups = []
      for (const it of sorted) {
        const g = groups.find((g) => g.some((o) => it.b.top < o.b.bottom - 1 && o.b.top < it.b.bottom - 1))
        if (g) g.push(it)
        else groups.push([it])
      }
      const tracks = win.getComputedStyle(el).display.includes("grid") ? win.getComputedStyle(el).gridTemplateColumns.split(" ").length : 2
      for (const g of groups) {
        if (g.length === 1) {
          if (tracks > 1 && g[0].b.width < eb.width - 10) flags.push(`orphan: "${label(g[0].k)}" alone in a row of ${name}`)
          continue
        }
        // Per column (items sharing a left edge, so a row-span card's stacked neighbours count as one column):
        // first card top, section heading, last card bottom. Columns with no card (a dial) are not compared.
        const byX = new Map()
        for (const it of g) {
          const x = r0(it.b.left)
          byX.set(x, [...(byX.get(x) || []), it])
        }
        if (byX.size < 2) continue
        const colsInfo = [...byX.values()].map((items) => {
          const cs = items.flatMap(({ k }) => (isCard(k) ? [k] : [...k.querySelectorAll("*")].filter(isCard)))
          const head = items.some(({ k }) => [...k.querySelectorAll("h2, h3")].some((h) => !h.closest("[data-slot=card], [class*='rounded-2xl']") && vis(h)))
          if (!cs.length) return { k: items[0].k, card: false, lastBottom: Math.max(...items.map(({ k }) => innerBottom(k) - 20)), head }
          return { k: items[0].k, card: true, firstTop: Math.min(...cs.map((c) => c.getBoundingClientRect().top)), lastBottom: Math.max(...cs.map((c) => c.getBoundingClientRect().bottom)), head }
        })
        const rowBottom = Math.max(...colsInfo.map((c) => c.lastBottom))
        for (const c of colsInfo) if (rowBottom - c.lastBottom > TOL.empty) flags.push(`empty: ${r0(rowBottom - c.lastBottom)} px under "${label(c.k)}"`)
        const cardCols = colsInfo.filter((c) => c.card)
        if (cardCols.length < 2) continue
        const tops = cardCols.map((c) => c.firstTop)
        const bottoms = cardCols.map((c) => c.lastBottom)
        if (Math.max(...tops) - Math.min(...tops) > TOL.top) flags.push(`top: first cards ${tops.map(r0).join(" / ")} in ${name}`)
        if (new Set(cardCols.map((c) => c.head)).size > 1) flags.push(`heading: only some columns have a section heading in ${name}`)
        if (Math.max(...bottoms) - Math.min(...bottoms) > TOL.height) flags.push(`height: bottoms ${bottoms.map(r0).join(" / ")} (Δ${r0(Math.max(...bottoms) - Math.min(...bottoms))}) in ${name}`)
      }
    }

    // 4. Cards stretched past their content.
    for (const c of col.querySelectorAll("[data-slot=card], [class*='rounded-2xl']")) {
      if (!vis(c)) continue
      const gap = c.getBoundingClientRect().bottom - innerBottom(c)
      if (gap > TOL.empty) flags.push(`stretched: "${label(c)}" has ${r0(gap)} px empty inside`)
    }

    // 5. Vertical rhythm: gaps between sibling sections of the page stack and of each column.
    const stacks = [col.lastElementChild, ...rows.flatMap((r) => r.kids)]
    for (const s of stacks) {
      const kids = [...s.children].filter((k) => vis(k) && k.getBoundingClientRect().height >= 40)
      if (kids.length < 3) continue
      const gaps = []
      for (let i = 1; i < kids.length; i++) {
        const a = kids[i - 1].getBoundingClientRect()
        const b = kids[i].getBoundingClientRect()
        if (b.top >= a.bottom - 1 && Math.abs(a.left - b.left) < 2) gaps.push(r0(b.top - a.bottom))
      }
      const set = [...new Set(gaps)]
      if (set.length > 1) flags.push(`rhythm: gaps ${gaps.join(", ")} in ${label(s)}`)
    }

    function innerBottom(card) {
      let m = card.getBoundingClientRect().top
      for (const d of card.querySelectorAll("*")) {
        if (d.children.length && d.tagName !== "svg") continue
        if (d.closest("svg") && d.tagName !== "svg") continue
        const b = d.getBoundingClientRect()
        if (b.height > 0 && b.width > 0) m = Math.max(m, b.bottom)
      }
      return m + 20
    }
    function label(el) {
      const h = el.querySelector?.("h1, h2, h3")
      const t = (h?.textContent || el.getAttribute?.("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ")
      return t.slice(0, 28)
    }

    return { overflow: de.scrollWidth - de.clientWidth, col: [r0(L), r0(R)], flags: [...new Set(flags)] }
  }

  const out = []
  for (const w of WIDTHS)
    for (const route of ROUTES) {
      const f = document.createElement("iframe")
      f.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:1000px;border:0;opacity:0;pointer-events:none;z-index:-1`
      f.src = route
      document.body.appendChild(f)
      await new Promise((res) => (f.onload = res))
      await new Promise((res) => setTimeout(res, 1200))
      try {
        out.push({ route, w, ...analyse(f.contentDocument, f.contentWindow) })
      } catch (e) {
        out.push({ route, w, error: String(e) })
      }
      f.remove()
    }
  return out
}
