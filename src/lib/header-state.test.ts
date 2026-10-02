import { describe, expect, it } from "vitest";
import { nextHeaderState, RINGS_AT } from "./header-state";

describe("nextHeaderState", () => {
  it("stays top while the dials are still shrinking, including a pause halfway", () => {
    expect(nextHeaderState(0)).toBe("top");
    expect(nextHeaderState(0.5)).toBe("top");
    expect(nextHeaderState(0.999)).toBe("top");
  });

  it("hands over to the ring row, keeping the top row, once the dials have docked", () => {
    expect(RINGS_AT).toBe(1);
    expect(nextHeaderState(1)).toBe("rings");
  });
});
