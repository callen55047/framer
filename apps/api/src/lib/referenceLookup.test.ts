import { describe, expect, it } from "vitest";
import { routeReferenceLookup } from "./referenceLookup.js";

describe("referenceLookup", () => {
  it("routes component_database queries to Specshift search URL", () => {
    const { source, url } = routeReferenceLookup("component_database", "shimano crank");
    expect(source.id).toBe("specshift");
    expect(url).toContain("specshift.bike");
    expect(url).toContain(encodeURIComponent("shimano crank"));
  });

  it("rejects retailer categories", () => {
    expect(() => routeReferenceLookup("retailer_pricing", "fork")).toThrow(/not available/i);
  });

  it("requires a non-empty query", () => {
    expect(() => routeReferenceLookup("bike_specs", "   ")).toThrow(/query is required/i);
  });

  it("rejects invalid categories", () => {
    expect(() => routeReferenceLookup("not-a-category", "test")).toThrow(/Invalid category/i);
  });
});
