import { describe, expect, it } from "vitest";
import { checkCompatibility, parseProductSpecs, type CompatibilityProduct } from "./compatibilityRules.js";

function product(overrides: Partial<CompatibilityProduct> & Pick<CompatibilityProduct, "id">): CompatibilityProduct {
  return {
    brand: "Test",
    model: "Part",
    category: "other",
    specs: {},
    ...overrides,
  };
}

describe("compatibilityRules", () => {
  it("passes when shared specs match", () => {
    const frame = product({
      id: "frame-1",
      category: "frame",
      specs: { wheelSizeInches: 29, steererStandard: "tapered" },
    });
    const wheel = product({
      id: "wheel-1",
      category: "wheelset",
      specs: { wheelSizeInches: 29, steererStandard: "tapered" },
    });
    const result = checkCompatibility(frame, wheel);
    expect(result.compatible).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("flags wheel size mismatch", () => {
    const a = product({ id: "a", specs: { wheelSizeInches: 29 } });
    const b = product({ id: "b", specs: { wheelSizeInches: 27.5 } });
    const result = checkCompatibility(a, b);
    expect(result.compatible).toBe(false);
    expect(result.violations[0]?.rule).toBe("wheelSizeInches");
  });

  it("flags fork travel exceeding frame maximum", () => {
    const frame = product({
      id: "frame-1",
      category: "frame",
      specs: { maxForkTravelMm: 150 },
    });
    const fork = product({
      id: "fork-1",
      category: "fork",
      specs: { maxForkTravelMm: 160 },
    });
    const result = checkCompatibility(frame, fork);
    expect(result.compatible).toBe(false);
    expect(result.violations[0]?.rule).toBe("maxForkTravelMm");
  });

  it("reports missing specs instead of guessing", () => {
    const frame = product({ id: "frame-1", category: "frame", specs: { maxForkTravelMm: 150 } });
    const fork = product({ id: "fork-1", category: "fork", specs: {} });
    const result = checkCompatibility(frame, fork);
    expect(result.compatible).toBe(true);
    expect(result.missingSpecs.length).toBeGreaterThan(0);
  });

  it("parses JSON specs strings", () => {
    expect(parseProductSpecs('{"wheelSizeInches":29}')).toEqual({ wheelSizeInches: 29 });
  });
});
