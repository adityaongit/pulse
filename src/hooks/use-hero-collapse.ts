import * as React from "react"

export type HeroCollapseState = "top" | "collapsed"

/**
 * The detail screens' sticky hero (spec §4.3a, docs/design/sticky.md B4). Writes `data-state` on the header:
 * `collapsed` once the hero's bottom edge has scrolled under the header's first row (`[data-collapse-row]`),
 * `top` otherwise. One IntersectionObserver, no scroll listener and no React state; CSS runs the time-based
 * transition. Focus inside `[data-collapse-keep]` (the title and date switcher) shows or holds `top` until it leaves.
 */
export function useHeroCollapse(header: React.RefObject<HTMLElement | null>, hero: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const h = header.current
    const target = hero.current
    if (!h || !target) return
    const row = h.querySelector("[data-collapse-row]") ?? h
    let want: HeroCollapseState = "top"
    const apply = () => {
      const keep = want === "collapsed" && !!h.querySelector("[data-collapse-keep]")?.matches(":focus-within")
      h.dataset.state = keep ? "top" : want
    }
    // ponytail: the row's bottom is read once; a resize across the md breakpoint (44 → 52 px) is off by 8 px until reload.
    const io = new IntersectionObserver(
      ([e]) => {
        want = !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) ? "collapsed" : "top"
        apply()
      },
      { rootMargin: `-${Math.round(row.getBoundingClientRect().bottom)}px 0px 0px 0px` }
    )
    io.observe(target)
    let t = 0
    const onFocusOut = () => {
      clearTimeout(t)
      t = window.setTimeout(apply) // after focus has moved on
    }
    h.addEventListener("focusin", apply)
    h.addEventListener("focusout", onFocusOut)
    return () => {
      io.disconnect()
      clearTimeout(t)
      h.removeEventListener("focusin", apply)
      h.removeEventListener("focusout", onFocusOut)
    }
  }, [header, hero])
}
