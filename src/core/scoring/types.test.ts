import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// types.ts holds no logic; this file guards the boundary every scoring module shares (KTD4).
describe("src/core/scoring purity", () => {
  const dir = new URL(".", import.meta.url);
  const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("imports only sibling modules: nothing from server, app, node or packages", () => {
    expect(sources.length).toBeGreaterThanOrEqual(9);
    for (const f of sources) {
      const specifiers = [...readFileSync(new URL(f, dir), "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const s of specifiers) expect(s, `${f} imports ${s}`).toMatch(/^\.\/[a-zA-Z]+$/);
    }
  });
});
