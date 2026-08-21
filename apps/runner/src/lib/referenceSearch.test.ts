import { describe, expect, it } from "vitest";
import { parseReferenceSearchResults } from "./referenceSearch.js";
import type { ReferenceSource } from "@framer/schema";

const geometryGeeksSource: ReferenceSource = {
  id: "geometry-geeks",
  name: "Geometry Geeks",
  url: "https://geometrygeeks.bike/",
  category: "bike_specs",
  domains: ["geometrygeeks.bike"],
  jobKinds: ["ExtractSpecs"],
  searchUrlTemplate: "https://geometrygeeks.bike/search/?q={query}",
  searchRendering: "server",
  resultLinkSelector: 'a[href^="/bike/"]',
  searchProbeQuery: "rocky mountain altitude",
};

describe("referenceSearch", () => {
  it("parses geometry geeks search result links", () => {
    const html = `<html><body>
      <a href="/bike/rocky-mountain-altitude-2021/">Rocky Mountain Altitude 2021</a>
      <a href="/bike/rocky-mountain-altitude-2022/">Rocky Mountain Altitude 2022</a>
    </body></html>`;

    const results = parseReferenceSearchResults(
      html,
      geometryGeeksSource,
      "https://geometrygeeks.bike/search/?q=altitude",
      5
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.url).toBe("https://geometrygeeks.bike/bike/rocky-mountain-altitude-2021/");
    expect(results[0]?.title).toContain("2021");
  });
});
