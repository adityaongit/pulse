import { expect, test, type Page } from "@playwright/test";
import { days, withDay } from "./days";

// Spec §8 journeys 1-8, in demo mode. Runs at 390 (phone) and 1440 (laptop); see playwright.config.ts.

const url = (path: string) => new RegExp(`${path.replace(/[?.]/g, "\\$&")}$`);

async function scrollUntil(page: Page, done: () => Promise<boolean>) {
  for (let i = 0; i < 40 && !(await done()); i++) {
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.waitForTimeout(60);
  }
}

test("1. morning check: Home → Recovery → drivers → back", async ({ page }) => {
  const d = days().past!;
  await page.goto(withDay("/", d));
  await page.getByRole("link", { name: /^Recovery \d+ percent.*Open Recovery details$/ }).click();
  await expect(page).toHaveURL(url(withDay("/recovery", d)));
  await expect(page.getByRole("heading", { level: 1, name: "Recovery" })).toBeVisible();
  await page.getByRole("link", { name: "See what shaped it" }).click();
  const drivers = page.getByRole("region", { name: "What shaped it" });
  await expect(drivers).toBeInViewport();
  await expect(drivers.getByRole("listitem").first()).toContainText(/Recovery|effect/);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(url(withDay("/", d)));
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeAttached();
});

test("2. browse the past: calendar panel → a past day → ?d= carries into Recovery, Strain, Sleep", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open calendar$/ }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Previous month" }).click();
  // The 15th of last month: always seeded, always in the past.
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const d = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-15`;
  await panel.locator(`[data-day="${d}"]`).click();
  await expect(page).toHaveURL(url(`/?d=${d}`));
  await expect(panel).toBeHidden();

  for (const [name, path] of [
    [/^Recovery .*Open Recovery details$/, "/recovery"],
    [/^Strain .*Open Strain details$/, "/strain"],
    [/^Sleep .*Open Sleep details$/, "/sleep"],
  ] as const) {
    await page.getByRole("link", { name }).click();
    await expect(page).toHaveURL(url(`${path}?d=${d}`));
    await expect(page.getByRole("button", { name: /Open calendar$/ })).not.toHaveAccessibleName(/^Today/);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(url(`/?d=${d}`));
  }
});

test("3. workout review: Strain → activity → HR and zones", async ({ page }) => {
  const d = days().past!;
  await page.goto(withDay("/strain", d));
  await page.getByRole("region", { name: "Activities" }).getByRole("link", { name: /^Running/ }).click();
  await expect(page).toHaveURL(/\/activity\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Running" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Heart rate" }).getByRole("figure")).toBeVisible();
  await expect(page.getByRole("region", { name: "Time in zones" }).getByRole("listitem")).toHaveCount(5);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(url(withDay("/strain", d)));
});

test("4. bedtime plan: Home's Tonight's sleep → the Sleep planner", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("region", { name: "Tonight's sleep" });
  await card.getByRole("radio", { name: /^Perform/ }).click();
  await expect(card.getByRole("radio", { name: /^Perform/ })).toBeChecked();
  await expect(card.getByRole("group", { name: /for perform$/ })).toBeVisible();
  await card.getByRole("link", { name: "Open Sleep Planner" }).click();
  await expect(page).toHaveURL(/\/sleep(\?d=[\d-]+)?#planner$/);
  const planner = page.getByRole("region", { name: "Tonight's sleep" });
  await expect(planner).toBeInViewport();
  for (const goal of ["Peak", "Perform", "Get by"]) await expect(planner.getByText(goal, { exact: true })).toBeVisible();
});

test("5. healthspan: Health → Healthspan → header collapses → contributor sheet", async ({ page }) => {
  await page.goto("/health");
  await page.getByRole("link", { name: "Healthspan" }).click();
  await expect(page).toHaveURL(url("/health/healthspan"));
  await expect(page.getByRole("img", { name: /^Pulse Age/ }).first()).toBeVisible();

  const header = page.locator("main header[data-state]");
  await scrollUntil(page, async () => (await header.getAttribute("data-state")) === "collapsed");
  await expect(header).toHaveAttribute("data-state", "collapsed");
  // The compact orb (between the two header stats) fades in once collapsed.
  const orb = header.locator("[data-collapse-row] > [aria-hidden] > div");
  await expect(orb).toContainText("Pulse Age");
  await expect.poll(() => orb.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  await expect(orb).toBeInViewport();

  const vo2 = page.getByRole("button", { name: /^VO2 max/ });
  await vo2.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: /VO2 max/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(vo2).toBeFocused();
});

test("6. illness week: Home alert → Health Monitor flags", async ({ page }) => {
  const d = days().illness!;
  await page.goto(withDay("/", d));
  await expect(page.getByRole("alert").filter({ hasText: "Your body may be fighting something" })).toBeVisible();
  await page.getByRole("link", { name: "View Health Monitor" }).click();
  await expect(page).toHaveURL(url(withDay("/health/monitor", d)));
  await expect(page.getByRole("alert").filter({ hasText: "Possible illness signal" })).toBeVisible();
  const readings = page.getByRole("region", { name: "Last night's readings" });
  await expect(readings.getByRole("button", { name: /(Below|Above) / }).first()).toBeVisible();
});

test("7. journal: check in with the round button or + → save → Insights shows the alcohol effect", async ({ page }) => {
  await page.goto("/");
  // The round button on phone, the sidebar's "Check in" on laptop: the same link, one visible per width.
  await page.getByRole("link", { name: "Check in for Today" }).filter({ visible: true }).click();
  const sheet = page.getByRole("dialog", { name: "Check in" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radiogroup", { name: "Alcohol" }).getByRole("radio", { name: "Yes" }).click();
  await sheet.getByRole("radiogroup", { name: "Stretching" }).getByRole("radio", { name: "No" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Check-in saved")).toBeVisible();
  await expect(sheet).toBeHidden();

  await page.goto("/journal/insights");
  const alcohol = page.getByRole("button", { name: /^Alcohol lowered next-day Recovery/ });
  await expect(alcohol).toBeVisible();
  await expect(page.getByRole("list").getByRole("button").first()).toHaveAccessibleName(/^(Alcohol|Illness) lowered/);
});

test("8. weekly report: Home teaser → report → previous / next", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Your week in review/ }).click();
  await expect(page).toHaveURL(/\/reports\/\d{4}-W\d{2}$/);
  const latest = page.url();
  await expect(page.getByRole("heading", { level: 1, name: "Weekly report" })).toBeVisible();
  await page.getByRole("link", { name: "Previous week" }).click();
  await expect(page).not.toHaveURL(latest);
  await expect(page).toHaveURL(/\/reports\/\d{4}-W\d{2}$/);
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(latest);
  await page.getByRole("navigation", { name: "Report period" }).getByRole("link", { name: "Month" }).click();
  await expect(page).toHaveURL(/\/reports\/\d{4}-\d{2}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Monthly report" })).toBeVisible();
});

test("9. More hub: Trends and a metric switch, a custom behaviour in the check-in, a CSV export", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary" }).filter({ visible: true }).first().getByRole("link", { name: "More" }).click();
  await expect(page).toHaveURL(url("/more"));
  // Phones reach Settings from More's account row; the sidebar carries it from 768 px.
  if (info.project.name === "390") await expect(page.getByRole("link", { name: /Settings$/ })).toBeVisible();

  await page.getByRole("link", { name: /^Trends/ }).click();
  await expect(page).toHaveURL(url("/trends"));
  await expect(page.getByRole("heading", { level: 2, name: "Recovery" })).toBeVisible();
  await page.getByRole("navigation", { name: "Metric" }).getByRole("link", { name: "Heart rate variability" }).click();
  await expect(page).toHaveURL(url("/trends?metric=hrv"));
  await expect(page.getByRole("heading", { level: 2, name: "Heart rate variability" })).toBeVisible();
  await page.getByRole("radio", { name: "1 year" }).click();
  await expect(page).toHaveURL(/\/trends\?metric=hrv&r=1y$/);
  await expect(page.getByRole("navigation", { name: "Metric" }).getByRole("link", { name: "Heart rate variability" })).toHaveAttribute("aria-current", "page");

  const name = `Plunge ${info.project.name} ${Date.now() % 1e6}`;
  await page.goto("/more");
  await page.getByRole("link", { name: /^Behaviours/ }).click();
  await expect(page).toHaveURL(url("/more/behaviours"));
  await page.getByLabel("Add a behaviour").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("switch", { name: `Show ${name} in the check-in` })).toBeChecked();
  await page.goto("/journal?checkin=1");
  const sheet = page.getByRole("dialog", { name: "Check in" });
  await expect(sheet.getByRole("radiogroup", { name })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/more/data");
  const download = page.waitForEvent("download");
  await page.getByRole("region", { name: "Daily scores" }).getByRole("link", { name: "CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^pulse-daily-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("Home header: dials, then scroll, then the ring row under a fixed top row", async ({ page }, info) => {
  test.skip(info.project.name !== "390", "the scroll-linked header is the phone layout");
  await page.goto(withDay("/", days().past));
  const panel = page.locator("[data-state]").filter({ has: page.getByRole("navigation", { name: "Today's scores" }) });
  const ringRow = page.getByRole("navigation", { name: "Today's scores" });
  await expect(page.getByRole("link", { name: /^Recovery .*Open Recovery details$/ })).toBeInViewport();
  await expect(panel).toHaveAttribute("data-state", "top");

  await scrollUntil(page, async () => (await panel.getAttribute("data-state")) === "rings");
  await expect(panel).toHaveAttribute("data-state", "rings");
  await expect.poll(() => ringRow.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.99);
  await expect(ringRow.getByRole("link", { name: /^Recovery \d+ percent/ })).toBeInViewport();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: /Open calendar$/ })).toBeInViewport();
  await page.goto("/");
  await scrollUntil(page, async () => (await panel.getAttribute("data-state")) === "rings");
  await expect(page.getByRole("img", { name: /-day streak$/ })).toBeInViewport();
});
