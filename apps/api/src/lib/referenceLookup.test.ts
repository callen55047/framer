import { describe, expect, it } from "vitest";
import { routeReferenceLookup, routeReferenceSearch } from "./referenceLookup.js";

describe("referenceLookup", () => {
  it("routes bike_specs queries to geometry geeks search URL", () => {
    const { sources, query } = routeReferenceSearch("bike_specs", "rocky mountain altitude");
    expect(sources[0]?.id).toBe("geometry-geeks");
    expect(query).toBe("rocky mountain altitude");
    const { url } = routeReferenceLookup("bike_specs", "rocky mountain altitude");
    expect(url).toContain("geometrygeeks.bike");
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
