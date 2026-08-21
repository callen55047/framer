import { describe, expect, it } from "vitest";
import { groundSpecs } from "./groundSpecs.js";

describe("groundSpecs", () => {
  it("keeps only values present in source text", () => {
    const source = "Reach 454 mm stack 630 head angle 64.5";
    const result = groundSpecs(
      { reachMm: 454, stackMm: 630, headTubeAngleDeg: 64.5, wheelSizeInches: 27.5 },
      source
    );
    expect(result.groundedFields).toContain("reachMm");
    expect(result.groundedFields).toContain("stackMm");
    expect(result.ungroundedFields).toContain("wheelSizeInches");
    expect(result.specs.reachMm).toBe(454);
    expect(result.specs.wheelSizeInches).toBeUndefined();
  });
});
