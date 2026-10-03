import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DAY_KEYS, days, withDay, type DayKey } from "./days";

// Every screen, at every viewport (the projects), on every scenario day that applies to it.
const DAY_ROUTES = ["/", "/recovery", "/strain", "/sleep", "/health/healthspan", "/health/monitor", "/health/stress", "/journal"];
const OTHER_ROUTES = ["/activity", "/health", "/health/fitness", "/journal/insights", "/reports/week", "/reports/month", "/more", "/settings"];

/** Text that is ellipsised by design, matched with `closest()`. */
const ELLIPSIS_OK: string[] = [];

/** Resolves the placeholder routes that need an id or period from the app itself. */
async function resolve(page: Page, route: string) {
  if (route === "/activity") {
    await page.goto(withDay("/strain", days().past));
    return (await page.getByRole("region", { name: "Activities" }).getByRole("link").first().getAttribute("href"))!;
  }
  if (route.startsWith("/reports/")) {
    await page.goto("/more");
    const name = route.endsWith("week") ? /^Weekly report/ : /^Monthly report/;
    return (await page.getByRole("link", { name }).getAttribute("href"))!;
  }
  return route;
}

/** Fails on console errors and uncaught page errors. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Dial and chart entry animations run 700 ms.
  await page.waitForTimeout(800);
}

/** Layout and interaction checks on the rendered page; returns a list of problems. */
function audit(ellipsisOk: string[]) {
  const problems: string[] = [];
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth) problems.push(`horizontal overflow: scrollWidth ${root.scrollWidth} > clientWidth ${root.clientWidth}`);
  // The shell's <main> is overflow-x: clip, so the page never scrolls sideways; content wider than it is cut off instead.
  const main = document.getElementById("main");
  if (main && main.scrollWidth > main.clientWidth) problems.push(`content clipped by <main>: scrollWidth ${main.scrollWidth} > clientWidth ${main.clientWidth}`);

  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && !el.closest("[aria-hidden=true][inert], [hidden]");
  };
  const describe = (el: Element) => {
    const label = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().replace(/\s+/g, " ");
    return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}> "${label.slice(0, 60)}"`;
  };

  // Dial values stay inside the ring's inner circle, horizontally, and inside the ring box vertically.
  for (const value of document.querySelectorAll("[data-dial-part=value]")) {
    const ring = value.closest("[data-dial-part=ring]");
    if (!ring || !visible(value)) continue;
    const v = value.getBoundingClientRect();
    const r = ring.getBoundingClientRect();
    const inset = r.width * 0.06;
    if (v.left < r.left + inset - 0.5 || v.right > r.right - inset + 0.5 || v.top < r.top - 0.5 || v.bottom > r.bottom + 0.5)
      problems.push(`dial value clipped: ${describe(value)} [${Math.round(v.left)},${Math.round(v.right)}] in ring [${Math.round(r.left)},${Math.round(r.right)}]`);
  }

  const all = [...document.body.querySelectorAll("*")];
  for (const el of all) {
    if (!(el instanceof HTMLElement) || !visible(el)) continue;
    const s = getComputedStyle(el);
    // Ellipsis truncation that actually hides text.
    const clamped = s.webkitLineClamp !== "none" && s.webkitLineClamp !== "" && el.scrollHeight > el.clientHeight + 1;
    const ellipsed = s.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1;
    if ((clamped || ellipsed) && !ellipsisOk.some((sel) => el.closest(sel))) problems.push(`text truncated: ${describe(el)}`);
  }

  // Dead interactive elements: they look clickable but nothing handles the click.
  const reactProps = (el: Element): Record<string, unknown> | undefined => {
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    return key ? (el as unknown as Record<string, Record<string, unknown>>)[key] : undefined;
  };
  const HANDLERS = ["onClick", "onClickCapture", "onPointerDown", "onPointerUp", "onMouseDown", "onMouseUp", "onTouchStart", "onTouchEnd", "onKeyDown"];
  const handles = (el: Element) => {
    if (el.matches("a[href], input, select, textarea, label, summary, button[type=submit], [contenteditable=true]")) return true;
    if (el.matches(":disabled, [aria-disabled=true]")) return true;
    const p = reactProps(el);
    return !!p && HANDLERS.some((h) => typeof p[h] === "function");
  };
  const interactive = (el: Element) => el.matches("a, button, [role=button], [role=link]") || getComputedStyle(el).cursor === "pointer";
  for (const el of all) {
    if (!visible(el) || !interactive(el)) continue;
    // Only the outermost pointer element of a group: icons and labels inside a button inherit its cursor.
    if (el.parentElement && el.parentElement !== document.body && interactive(el.parentElement) && !el.matches("a, button, [role=button], [role=link]")) continue;
    let ok = false;
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) if ((ok = handles(n))) break;
    if (!ok) problems.push(`dead interactive element: ${describe(el)}`);
  }
  return problems;
}

test.describe("sweep", () => {
  const screens = (project: string) => {
    const dir = `e2e/__screens__/${project}`;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  const cases: [string, DayKey | null][] = [...DAY_ROUTES.flatMap((r) => DAY_KEYS.map((d) => [r, d] as [string, DayKey])), ...OTHER_ROUTES.map((r) => [r, null] as [string, null])];

  for (const [route, day] of cases) {
    test(`${route}${day ? ` @ ${day}` : ""}`, async ({ page }, info) => {
      const target = withDay(await resolve(page, route), day ? days()[day] : null);
      const errors = watchErrors(page);
      const res = await page.goto(target);
      expect(res?.status(), `${target} status`).toBeLessThan(400);
      await settle(page);
      const slug = `${route.replace(/\//g, "_") || "_"}${day ? `__${day}` : ""}`;
      await page.screenshot({ path: `${screens(info.project.name)}/${slug}.png`, fullPage: true });
      const problems = await page.evaluate(audit, ELLIPSIS_OK);
      expect(problems, target).toEqual([]);
      expect(errors, target).toEqual([]);
    });
  }

  test("headers share one top padding", async ({ page }) => {
    // The first row of every screen's header sits at the same height: its controls' vertical centre.
    const centres: Record<string, number> = {};
    for (const route of ["/", "/recovery", "/strain", "/sleep", "/health", "/health/healthspan", "/health/monitor", "/health/stress", "/health/fitness", "/journal", "/journal/insights", "/more", "/settings"]) {
      await page.goto(route);
      await settle(page);
      centres[route] = await page.evaluate(() => {
        const header = document.querySelector("main header") ?? document.querySelector("main");
        const first = [...header!.querySelectorAll("h1:not(.sr-only), a, button")].find((el) => el.getBoundingClientRect().height > 0)!;
        const r = first.getBoundingClientRect();
        return Math.round(r.top + r.height / 2);
      });
    }
    const values = Object.values(centres);
    expect(Math.max(...values) - Math.min(...values), JSON.stringify(centres)).toBeLessThanOrEqual(1);
  });

  test("Home ring row: rings clear their labels and each other", async ({ page }, info) => {
    test.skip(info.project.name !== "390", "one run covers 320, 361 and 390");
    for (const width of [320, 361, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(withDay("/", days().past));
      await settle(page);
      await page.evaluate(() => window.scrollTo(0, 900));
      await expect(page.locator("[data-state]").filter({ has: page.getByRole("navigation", { name: "Today's scores" }) })).toHaveAttribute("data-state", "rings");
      const overlaps = await page.evaluate(() => {
        const box = (el: Element | null) => el!.getBoundingClientRect();
        const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        const out: string[] = [];
        const groups: DOMRect[] = [];
        for (const key of ["sleep", "recovery", "strain"]) {
          const ring = box(document.querySelector(`[data-ring=${key}]`));
          const label = box(document.querySelector(`[data-ring-label=${key}]`));
          if (hit(ring, label)) out.push(`${key}: ring overlaps its label`);
          groups.push(new DOMRect(Math.min(ring.left, label.left), Math.min(ring.top, label.top), Math.max(ring.right, label.right) - Math.min(ring.left, label.left), Math.max(ring.bottom, label.bottom) - Math.min(ring.top, label.top)));
        }
        if (hit(groups[0], groups[1]) || hit(groups[1], groups[2])) out.push("ring groups overlap each other");
        return out;
      });
      expect(overlaps, `${width} px`).toEqual([]);
    }
  });
});
