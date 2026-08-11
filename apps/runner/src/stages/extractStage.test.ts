import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import * as extractListingModule from "../inference/extractListing.js";
import { extractStage } from "../stages/extractStage.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/shopify");

describe("extractStage", () => {
  it("uses Shopify structured data instead of the model when meta.product is present", async () => {
    const html = readFileSync(path.join(fixturesDir, "instinct-meta-snippet.html"), "utf8");
    const pageText =
      "Reserve 42|49 Turbulent Aero Wheelset 700c $2,499.99 Rocky Mountain Bikes Instinct C50 $6,999.99 In Stock!";
    const pageUrl =
      "https://mudsweatandgears.ca/products/instinct-c50-1?variant=44714674979044";

    const modelSpy = vi.spyOn(extractListingModule, "extractListing").mockRejectedValue(
      new Error("model should not run for Shopify product pages")
    );

    const result = await extractStage({ pageText, html, pageUrl });

    expect(modelSpy).not.toHaveBeenCalled();
    expect(result.extraction.title).toBe("Instinct C50");
    expect(result.extraction.price).toBe(4899.99);
    expect(result.variants).toHaveLength(2);
    expect(result.groundedFields).toContain("title");
    expect(result.groundedFields).toContain("price");

    modelSpy.mockRestore();
  });
});
