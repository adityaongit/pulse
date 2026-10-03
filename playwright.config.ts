import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_DB } from "./e2e/days";

// The e2e server is a second `next dev` on its own port, build dir and throwaway demo DB, so it
// never touches the user's dev server on :3000 or data/demo.db. NODE_ENV=development is what lets
// DEV_ACCESS_BYPASS through (src/server/config.ts), which rules out `next start`.
const PORT = 3300;

const env = {
  GOOGLE_OAUTH_ENABLED: "false",
  DEV_ACCESS_BYPASS: "1",
  NODE_ENV: "development",
  BIRTH_DATE: "1990-01-01",
  SEX: "male",
  TZ: "Asia/Kolkata",
  DATABASE_PATH: E2E_DB,
  NEXT_DIST_DIR: ".next/e2e",
  PORT: String(PORT),
};

// Journeys run at one phone and one laptop width; the sweep runs everywhere.
const JOURNEYS = new Set(["390", "1440"]);
const touch = (name: string, width: number, height: number, deviceScaleFactor = 3) => ({
  name,
  testIgnore: JOURNEYS.has(name) ? [] : ["**/journeys.spec.ts"],
  use: { viewport: { width, height }, deviceScaleFactor, hasTouch: true, isMobile: true },
});
const desktop = (name: string, width: number, height: number) => ({
  name,
  testIgnore: JOURNEYS.has(name) ? [] : ["**/journeys.spec.ts"],
  use: { viewport: { width, height }, deviceScaleFactor: 1 },
});

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Dev compiles on demand; a few workers keep it from thrashing.
  workers: 4,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
  },
  projects: [
    touch("361", 361, 800, 3.5), // Android phone
    touch("390", 390, 844),
    touch("820", 820, 1180, 2),
    desktop("1440", 1440, 900),
    desktop("1920", 1920, 1080),
  ],
  webServer: {
    // Fresh DB each start: the worker seeds 180 days ending today on boot.
    command: `rm -f "${E2E_DB}"* && mkdir -p "${path.dirname(E2E_DB)}" && pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/healthz`,
    env,
    // Reuse only the e2e server itself (same port) while iterating locally; CI always starts fresh.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
