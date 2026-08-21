import { describe, expect, it } from "vitest";
import {
  REFERENCE_SOURCES,
  buildReferenceSearchUrl,
  findReferenceSourceByDomain,
  findReferenceSourceByUrl,
  getReferenceSourcesForJobKind,
  isRetailerReferenceSource,
  normalizeDomain,
  pickReferenceSourceForCategory,
} from "./referenceSources.js";

describe("referenceSources", () => {
  it("loads all catalog entries", () => {
    expect(REFERENCE_SOURCES).toHaveLength(20);
  });

  it("resolves www and apex domains to the same retailer source", () => {
    const apex = findReferenceSourceByDomain("jensonusa.com");
    const www = findReferenceSourceByDomain("www.jensonusa.com");
    expect(apex).toBeDefined();
    expect(www).toEqual(apex);
    expect(apex?.id).toBe("jenson-usa");
  });

  it("finds sources by full URL", () => {
    const source = findReferenceSourceByUrl(
      "https://www.competitivecyclist.com/rockshox-lyrik-ultimate-fork"
    );
    expect(source?.id).toBe("competitive-cyclist");
  });

  it("maps retailer categories to listing job kinds", () => {
    const retailers = REFERENCE_SOURCES.filter((s) => isRetailerReferenceSource(s));
    expect(retailers.length).toBeGreaterThan(0);
    for (const retailer of retailers) {
      expect(retailer.jobKinds).toContain("RefreshListing");
    }
  });

  it("maps manufacturer categories to ExtractSpecs", () => {
    const shimano = findReferenceSourceByDomain("productinfo.shimano.com");
    expect(shimano?.jobKinds).toEqual(["ExtractSpecs"]);
    const extractSources = getReferenceSourcesForJobKind("ExtractSpecs");
    expect(extractSources.some((s) => s.id === "shimano-product-information")).toBe(true);
  });

  it("normalizes domains consistently", () => {
    expect(normalizeDomain("WWW.JensonUSA.com")).toBe("jensonusa.com");
  });

  it("builds search URLs from templates", () => {
    const source = pickReferenceSourceForCategory("component_database", "fox fork");
    expect(source?.id).toBe("specshift");
    expect(buildReferenceSearchUrl(source!, "fox fork")).toBe(
      "https://www.specshift.bike/search?q=fox%20fork"
    );
  });
});
