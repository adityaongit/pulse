"use client"

import * as React from "react"

/**
 * Scrolls to `location.hash` once the page has rendered. Next's own hash scroll runs while the
 * route's loading skeleton is showing, before the target exists (journey 4: `/sleep#planner`).
 */
export function HashScroll() {
  React.useEffect(() => {
    let id: string
    try {
      id = decodeURIComponent(window.location.hash.slice(1))
    } catch {
      return // malformed escape in the hash
    }
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" })
  }, [])
  return null
}
