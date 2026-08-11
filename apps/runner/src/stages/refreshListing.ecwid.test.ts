import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClientModule from "../lib/apiClient.js";
import * as extractListingModule from "../inference/extractListing.js";
import { buildListingPageText } from "../lib/listingPageText.js";
import { extractStage } from "./extractStage.js";
import { validateStage } from "./validateStage.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/ecwid");
const pageUrl = "https://gearhub.ca/products/rocky-mountain-instinct-alloy-frame-no-shock-2023";

/**
 * Tracer bullet for the Gearhub Ecwid regression: validate must not permanently
 * reject the listing, and extract must persist a grounded price from structured
 * product data even when the relevance model says not_a_product_listing.
 */
describe("refreshListing ecwid tracer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports a Gearhub frame through validate and extract when relevance is wrong", async () => {
    vi.spyOn(apiClientModule, "markListingUnsupportedRemote").mockResolvedValue();
    const shellHtml = readFileSync(path.join(fixturesDir, "gearhub-shell.html"), "utf8");
    const augmentedHtml = readFileSync(path.join(fixturesDir, "gearhub-augmented-product.html"), "utf8");
    const pageText = buildListingPageText(augmentedHtml);

    vi.spyOn(extractListingModule, "classifyListingRelevance").mockResolvedValue({
      supported: false,
      reason: "not_a_product_listing",
    });
    const modelSpy = vi.spyOn(extractListingModule, "extractListing").mockRejectedValue(
      new Error("model should not run for Ecwid product pages")
    );

    await expect(
      validateStage({
        pageText: buildListingPageText(shellHtml),
        html: shellHtml,
        pageUrl,
        listingId: "00000000-0000-0000-0000-000000000099",
        itemKind: "component",
      })
    ).resolves.toBeUndefined();

    const extracted = await extractStage({
      pageText,
      html: augmentedHtml,
      pageUrl,
      itemKind: "component",
      expectedCategory: "frame",
    });

    expect(modelSpy).not.toHaveBeenCalled();
    expect(extracted.extraction).toMatchObject({
      price: 995,
      currency: "CAD",
      inStock: true,
    });
    expect(extracted.extraction.title).toMatch(/Instinct Alloy Frame/i);
    expect(apiClientModule.markListingUnsupportedRemote).not.toHaveBeenCalled();
  });
});
