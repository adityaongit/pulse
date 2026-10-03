import { expect, test as setup } from "@playwright/test";

// One demo sign-in for the whole run; the other projects load this session (playwright.config.ts STORAGE).
setup("sign in to the demo", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with demo data" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: "test-results/.auth/demo.json" });
});
