import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ShopifyVariantMatchError, tryExtractShopifyListing } from "./shopifyListing.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/shopify");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const instinctC30Artifact = path.join(
  repoRoot,
  "artifacts/jobs/645a93c0-1161-4f08-94dc-54af7e6de6d8/fetch.html.gz"
);

describe("tryExtractShopifyListing", () => {
  const html = readFileSync(path.join(fixturesDir, "instinct-meta-snippet.html"), "utf8");

  it("extracts the main product title and variant price from Shopify meta", () => {
    const url =
      "https://mudsweatandgears.ca/products/instinct-c50-1?variant=44714674979044";
    const result = tryExtractShopifyListing(html, url);

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Instinct C50");
    expect(result?.price).toBe(6999.99);
    expect(result?.currency).toBe("CAD");
    expect(result?.brand).toBe("Rocky Mountain Bikes");
    expect(result?.inStock).toBe(true);
  });

  it("uses the first variant when the URL has no variant query param", () => {
    const url = "https://mudsweatandgears.ca/products/instinct-c50-1";
    const result = tryExtractShopifyListing(html, url);

    expect(result?.price).toBe(4899.99);
  });

  it("ignores cart upsell products embedded in the page HTML", () => {
    const url =
      "https://mudsweatandgears.ca/products/instinct-c50-1?variant=44714674979044";
    const result = tryExtractShopifyListing(html, url);

    expect(result?.title).not.toMatch(/turbulent/i);
    expect(result?.price).not.toBe(2499.99);
  });

  it("reports product-level availability when any variant is purchasable", () => {
    let c30Html: string;
    try {
      c30Html = gunzipSync(readFileSync(instinctC30Artifact)).toString("utf8");
    } catch {
      return;
    }

    const url = "https://mudsweatandgears.ca/products/instinct-c30-grey-beige";
    const result = tryExtractShopifyListing(c30Html, url);

    expect(result?.price).toBe(4299.99);
    expect(result?.inStock).toBe(true);
  });

  it("uses the matched variant for a canonical size and wheel size", () => {
    let c30Html: string;
    try {
      c30Html = gunzipSync(readFileSync(instinctC30Artifact)).toString("utf8");
    } catch {
      return;
    }

    const url = "https://mudsweatandgears.ca/products/instinct-c30-grey-beige";
    const result = tryExtractShopifyListing(c30Html, url, {
      frameSize: "M",
      wheelSizeInches: "29",
    });

    expect(result?.price).toBe(4299.99);
    expect(result?.inStock).toBe(true);
  });

  it("throws when the requested configuration does not match any variant", () => {
    expect(() =>
      tryExtractShopifyListing(html, "https://mudsweatandgears.ca/products/instinct-c50-1", {
        frameSize: "S",
        wheelSizeInches: "27.5",
      })
    ).toThrow(ShopifyVariantMatchError);
  });
});
