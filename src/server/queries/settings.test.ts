import { describe, expect, it } from "vitest";
import { openDb } from "../db";
import { oauthTokens, syncState } from "../db/schema";
import { ctxFor } from "../testing";
import { getSettings, getShellStatus, syncErrorText } from "./settings";

const google = () => {
  const db = openDb(":memory:");
  db.insert(oauthTokens).values({ id: 1, accessToken: "a", refreshToken: "r", expiresAt: 1, scope: "s", updatedAt: 1 }).run();
  return { db, ctx: { ...ctxFor(db), mode: "google" as const } };
};

describe("sync errors", () => {
  it("read as a person would say them, keeping unknown codes", () => {
    expect(syncErrorText("[google] heart-rate: ACCOUNT_NOT_LINKED (HTTP 400)")).toBe("No Google Health profile");
    expect(syncErrorText("[google] steps dailyRollUp: RESOURCE_EXHAUSTED (HTTP 429)")).toBe("Rate limited, retrying");
    expect(syncErrorText("[google] sleep: http_503 (HTTP 503)")).toBe("Google is having trouble, retrying");
    expect(syncErrorText("[google] sleep: auth_revoked")).toBe("Access revoked");
    expect(syncErrorText("[google] sleep: INVALID_ARGUMENT (HTTP 400)")).toBe("Failed (INVALID_ARGUMENT)");
  });

  it("an account without Google Health is one problem: not_linked, no import progress, no per-row errors", () => {
    const { db, ctx } = google();
    for (const type of ["heart-rate", "sleep"])
      db.insert(syncState).values({ type, backfillDaysDone: 0, backfillDaysTotal: 180, lastError: `[google] ${type}: ACCOUNT_NOT_LINKED (HTTP 400)` }).run();
    expect(getShellStatus(ctx)).toMatchObject({ connection: "not_linked" });
    expect(getShellStatus(ctx).importProgress).toBeUndefined();
    const vm = getSettings(ctx);
    expect(vm.source.status).toBe("not_linked");
    expect(vm.import).toBeNull();
    expect(vm.sync.every((r) => r.error === null)).toBe(true);
  });

  it("a working grant mid-import shows progress and readable row errors", () => {
    const { db, ctx } = google();
    db.insert(syncState).values({ type: "heart-rate", backfillDaysDone: 30, backfillDaysTotal: 180, lastError: "[google] heart-rate: http_503 (HTTP 503)" }).run();
    expect(getShellStatus(ctx)).toMatchObject({ connection: "importing", importProgress: { done: 30, total: 180 } });
    expect(getSettings(ctx).sync.find((r) => r.key === "heart-rate")?.error).toBe("Google is having trouble, retrying");
  });
});
