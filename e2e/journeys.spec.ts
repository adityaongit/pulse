import { expect, test, type Page } from "@playwright/test";
import { days, withDay } from "./days";


const url = (path: string) => new RegExp(`${path.replace(/[?.]/g, "\\$&")}$`);

async function scrollUntil(page: Page, done: () => Promise<boolean>) {
  for (let i = 0; i < 40 && !(await done()); i++) {
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.waitForTimeout(60);
  }
}

test("1. morning check: Home → Recovery → its Trend View → back", async ({ page }) => {
  const d = days().past!;
  await page.goto(withDay("/", d));
  await page.getByRole("link", { name: /^Recovery \d+ percent.*Open Recovery details$/ }).click();
  await expect(page).toHaveURL(url(withDay("/recovery", d)));
  await expect(page.getByRole("heading", { level: 1, name: "Recovery" })).toBeVisible();
  await page.getByRole("link", { name: "Explore your recovery insights" }).click();
  await expect(page).toHaveURL(url(`/trend/recovery?d=${d}`));
  await expect(page.getByRole("heading", { level: 1, name: "Trend view" })).toBeVisible();
  await expect(page.getByText(/^Your average Recovery this month/)).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(url(withDay("/recovery", d)));
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(url(withDay("/", d)));
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeAttached();
});

test("2. browse the past: calendar panel → a past day → ?d= carries into Recovery, Strain, Sleep", async ({ page }) => {
  await page.goto("/");
  const panel = page.getByRole("dialog");
  // On a fast production build the first click can land before hydration and do nothing: click until it opens.
  await expect(async () => {
    await page.getByRole("button", { name: /Open calendar$/ }).click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
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
    await page.getByRole("link", { name: "Back" }).click();
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
  await expect(page.getByRole("region", { name: "Time in zones" }).getByRole("listitem")).toHaveCount(6);
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(url(withDay("/strain", d)));
});

test("4. bedtime plan: Home's Tonight's sleep → the Sleep planner", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("region", { name: "Tonight’s sleep" });
  await card.getByRole("radio", { name: /^Perform/ }).click();
  await expect(card.getByRole("radio", { name: /^Perform/ })).toBeChecked();
  await expect(card.getByRole("group", { name: /for perform$/ })).toBeVisible();
  await card.getByRole("link", { name: "Open Sleep Planner" }).click();
  await expect(page).toHaveURL(/\/sleep(\?d=[\d-]+)?#planner$/);
  const planner = page.getByRole("region", { name: "Tonight’s sleep" });
  await expect(planner).toBeInViewport();
  for (const goal of ["Peak", "Perform", "Get by"]) await expect(planner.getByText(goal, { exact: true })).toBeVisible();
});

test("5. healthspan: Health → Healthspan → header collapses → contributor sheet", async ({ page }) => {
  await page.goto("/health");
  await page.getByRole("link", { name: "Go to Healthspan" }).click();
  await expect(page).toHaveURL(url("/health/healthspan"));
  await expect(page.getByRole("img", { name: /^Pulse Age/ }).first()).toBeVisible();

  const header = page.locator("main header[data-state]");
  await scrollUntil(page, async () => (await header.getAttribute("data-state")) === "collapsed");
  await expect(header).toHaveAttribute("data-state", "collapsed");
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
  const readings = page.getByRole("region", { name: "Last night’s readings" });
  const vital = readings.getByRole("link", { name: /(Below|Above) / }).first();
  await expect(vital).toBeVisible();
  await vital.click();
  await expect(page).toHaveURL(new RegExp(`/metric/(hrv|rhr|resp|spo2|skin)\\?d=${d}$`));
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(url(withDay("/", d)));
});

test("dashboard vital metrics open their own details and return to the selected Home day", async ({ page }) => {
  const d = days().past!;
  await page.goto(withDay("/", d));
  for (const [label, key] of [
    ["Heart rate variability", "hrv"], ["Resting heart rate", "rhr"], ["Respiratory rate", "resp"],
    ["Blood oxygen", "spo2"], ["Skin temperature", "skin"],
  ]) {
    await page.getByRole("link", { name: new RegExp(`^${label}:? `) }).click();
    await expect(page).toHaveURL(url(withDay(`/metric/${key}`, d)));
    await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(url(withDay("/", d)));
  }
});

test("7. journal: check in with the round button or + → save → Insights shows the alcohol effect", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Check in for Today" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(url("/?checkin=1"));
  const sheet = page.getByRole("dialog", { name: "Journal" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radiogroup", { name: "Had any alcohol?" }).getByRole("radio", { name: "Yes" }).click();
  await sheet.getByRole("radiogroup", { name: "Stretched?" }).getByRole("radio", { name: "No" }).click();
  await sheet.getByRole("button", { name: "Save journal" }).click();
  await expect(page.getByText("Have a great day!")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(url("/"));

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
  if (info.project.name === "390") await expect(page.getByRole("link", { name: /^Account/ })).toHaveAttribute("href", "/settings?s=account");

  await page.getByRole("link", { name: /^Trends/ }).click();
  await expect(page).toHaveURL(url("/trends"));
  await expect(page.getByRole("heading", { level: 2, name: "Recovery" })).toBeVisible();
  await page.getByRole("button", { name: /Recovery & sleep/ }).click();
  if (info.project.name === "390") await page.getByRole("button", { name: /^Vitals/ }).click();
  await page.getByRole("link", { name: "Heart rate variability" }).click();
  await expect(page).toHaveURL(url("/trends?metric=hrv"));
  await expect(page.getByRole("heading", { level: 2, name: "Heart rate variability" })).toBeVisible();
  await page.getByRole("radio", { name: "1 year" }).click();
  await expect(page).toHaveURL(/\/trends\?metric=hrv&r=1y$/);
  await expect(page.getByRole("button", { name: /Vitals/ })).toContainText("Heart rate variability");

  const name = `Plunge ${info.project.name} ${Date.now() % 1e6}`;
  await page.goto("/more");
  await page.getByRole("link", { name: /^Behaviours/ }).click();
  await expect(page).toHaveURL(url("/more/behaviours"));
  await page.getByLabel("Add a behaviour").fill(name);
  await page.getByRole("button", { name: "Add behaviour", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: new RegExp(`^${name}`) })).toBeChecked();
  await page.goto("/journal?checkin=1");
  const sheet = page.getByRole("dialog", { name: "Journal" });
  await expect(sheet.getByRole("radiogroup", { name: `${name}?` })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Yes, dismiss journal" }).click();

  await page.goto("/more/data");
  const download = page.waitForEvent("download");
  await page.getByRole("region", { name: "Daily scores" }).getByRole("link", { name: "CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^pulse-daily-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("Home header: dials, then scroll, then the ring row under a fixed top row", async ({ page }, info) => {
  test.skip(info.project.name !== "390", "the scroll-linked header is the phone layout");
  await page.goto(withDay("/", days().past));
  const panel = page.locator("[data-state]").filter({ has: page.getByRole("navigation", { name: "Today’s scores" }) });
  const ringRow = page.getByRole("navigation", { name: "Today’s scores" });
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

test("10. My Day's +: the action menu → Add activity explains, Complete your journal opens the check-in", async ({ page }) => {
  await page.goto("/");
  const plus = page.getByRole("button", { name: "Add to today" });
  await plus.click();
  const menu = page.getByRole("menu");
  // Only entries Pulse has data for; Start activity, Strength trainer and Share live stay off (src/lib/features.ts).
  await expect(menu.getByRole("menuitem")).toHaveText([/Add activity/i, /Complete your journal/i]);
  await menu.getByRole("menuitem", { name: /Add activity/i }).click();
  const info = page.getByRole("dialog", { name: "Add an activity" });
  await expect(info).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(info).toBeHidden();
  await plus.click();
  await page.getByRole("menu").getByRole("menuitem", { name: /Complete your journal/i }).click();
  await expect(page).toHaveURL(url("/?checkin=1"));
  await expect(page.getByRole("dialog", { name: "Journal" })).toBeVisible();
});
