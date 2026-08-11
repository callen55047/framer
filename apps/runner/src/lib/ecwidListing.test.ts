import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  hasAffirmativeProductListingEvidence,
  inferEcwidInStock,
  parseEcwidProductId,
  parseEcwidStoreId,
  tryExtractEcwidListing,
} from "./ecwidListing.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/ecwid");
const pageUrl = "https://gearhub.ca/products/rocky-mountain-instinct-alloy-frame-no-shock-2023";

describe("ecwidListing", () => {
  const shellHtml = readFileSync(path.join(fixturesDir, "gearhub-shell.html"), "utf8");
  const augmentedHtml = readFileSync(path.join(fixturesDir, "gearhub-augmented-product.html"), "utf8");

  it("detects Ecwid store and product identifiers from the shell page", () => {
    expect(parseEcwidStoreId(shellHtml)).toBe(133855787);
    expect(parseEcwidProductId(shellHtml, pageUrl)).toBe(825563628);
    expect(hasAffirmativeProductListingEvidence(shellHtml, pageUrl)).toBe(true);
  });

  it("extracts the Gearhub Instinct frame price from augmented Ecwid static HTML", () => {
    const result = tryExtractEcwidListing(augmentedHtml, pageUrl);

    expect(result).not.toBeNull();
    expect(result?.title).toMatch(/Instinct Alloy Frame/i);
    expect(result?.price).toBe(995);
    expect(result?.currency).toBe("CAD");
    expect(result?.brand).toMatch(/Rocky Mountain/i);
  });

  it("treats the listing as in stock when at least one selectable variant is available", () => {
    expect(inferEcwidInStock(augmentedHtml)).toBe(true);
    expect(tryExtractEcwidListing(augmentedHtml, pageUrl)?.inStock).toBe(true);
  });

  it("reports out of stock only when every selectable variant is unavailable", () => {
    const allSoldOutHtml = augmentedHtml.replace(
      /form-control--radio/g,
      "form-control--radio form-control--disabled"
    );

    expect(inferEcwidInStock(allSoldOutHtml)).toBe(false);
    expect(tryExtractEcwidListing(allSoldOutHtml, pageUrl)?.inStock).toBe(false);
  });
});
