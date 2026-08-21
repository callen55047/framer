import { describe, expect, it, vi } from "vitest";
import { getSearchableSourcesForCategory } from "@framer/schema";

vi.mock("@framer/runner/lib/referenceSearch.js", () => ({
  searchReferenceCategory: vi.fn(async () => ({
    results: [
      {
        title: "Rocky Mountain Altitude 2021",
        url: "https://geometrygeeks.bike/bike/rocky-mountain-altitude-2021/",
        sourceId: "geometry-geeks",
        sourceName: "Geometry Geeks",
        sourceCategory: "bike_specs",
      },
    ],
    sourcesTried: ["geometry-geeks"],
    sourcesSkipped: [],
  })),
  fetchCatalogReferencePage: vi.fn(async () => ({
    url: "https://geometrygeeks.bike/bike/rocky-mountain-altitude-2021/",
    excerpt: "Reach | 400 | 423 | 454\nStack | 590 | 610 | 630",
    sourceId: "geometry-geeks",
    sourceName: "Geometry Geeks",
    sourceCategory: "bike_specs",
  })),
  MAX_IN_CHAT_REFERENCE_FETCHES: 3,
}));

describe("assistant research replay scenarios", () => {
  it("searchReference routes bike geometry questions to geometry geeks candidates", async () => {
    const sources = getSearchableSourcesForCategory("bike_specs");
    expect(sources[0]?.id).toBe("geometry-geeks");

    const { searchReferenceCategory } = await import("@framer/runner/lib/referenceSearch.js");
    const search = await searchReferenceCategory(
      "bike_specs",
      "2021 Rocky Mountain Altitude L mullet vs 29 geometry",
      3
    );
    expect(search.results[0]?.url).toContain("rocky-mountain-altitude-2021");
  });

  it("fetchReferencePage returns table-preserving excerpt for geometry replay", async () => {
    const { fetchCatalogReferencePage } = await import("@framer/runner/lib/referenceSearch.js");
    const page = await fetchCatalogReferencePage(
      "https://geometrygeeks.bike/bike/rocky-mountain-altitude-2021/",
      { section: "geometry" }
    );
    expect(page.excerpt).toContain("Reach |");
    expect(page.sourceName).toBe("Geometry Geeks");
  });

  it("checkCompatibility returns unknown for stem questions without catalog specs", async () => {
    const { checkCompatibility } = await import("./compatibilityRules.js");
    const result = checkCompatibility(
      {
        id: "bike-1",
        brand: "Rocky Mountain",
        model: "Altitude A70",
        category: "other",
        specs: {},
      },
      {
        id: "stem-1",
        brand: "Race Face",
        model: "Turbine R",
        category: "cockpit",
        specs: {},
      }
    );
    expect(result.verdict).toBe("unknown");
    expect(result.compatible).toBe(false);
  });
});
