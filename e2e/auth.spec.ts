import { expect, test } from "@playwright/test";

// U20 on a demo instance, signed out (no stored session). Runs at 390 and 1440 with the journeys.
test.use({ storageState: { cookies: [], origins: [] } });

test("signed out: every screen goes to sign-in; the demo signs in and Sign out signs out", async ({ page }) => {
  await page.goto("/strain");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Know when to push, and when to rest" })).toBeVisible();
  // A demo instance offers no Google sign-in.
  await expect(page.getByRole("link", { name: /Sign in with Google/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Continue with demo data" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeAttached();

  // Signed in, /login and /onboarding lead back to Home.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("a failed Google sign-in explains itself", async ({ page }) => {
  await page.goto("/login?error=access_denied");
  // Next's route announcer is an alert too; pick ours by its text.
  await expect(page.getByRole("alert").filter({ hasText: "Google sign-in was cancelled" })).toBeVisible();
});
