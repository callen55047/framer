import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import * as extractListingModule from "../inference/extractListing.js";
import { buildListingPageText } from "../lib/listingPageText.js";
import { extractStage } from "./extractStage.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/ecwid");
const pageUrl = "https://gearhub.ca/products/rocky-mountain-instinct-alloy-frame-no-shock-2023";

describe("extractStage ecwid regression", () => {
  it("extracts the Gearhub frame without calling the model when Ecwid static product data is present", async () => {
    const html = readFileSync(path.join(fixturesDir, "gearhub-augmented-product.html"), "utf8");
    const pageText = buildListingPageText(html);

    const modelSpy = vi.spyOn(extractListingModule, "extractListing").mockRejectedValue(
      new Error("model should not run for Ecwid product pages")
    );

    const result = await extractStage({ pageText, html, pageUrl, itemKind: "component", expectedCategory: "frame" });

    expect(modelSpy).not.toHaveBeenCalled();
    expect(result.extraction.price).toBe(995);
    expect(result.extraction.currency).toBe("CAD");
    expect(result.extraction.inStock).toBe(true);
    expect(result.groundedFields).toContain("price");

    modelSpy.mockRestore();
  });
});
