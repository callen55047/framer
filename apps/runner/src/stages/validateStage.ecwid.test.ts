import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as extractListingModule from "../inference/extractListing.js";
import * as apiClientModule from "../lib/apiClient.js";
import { validateStage } from "./validateStage.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/ecwid");
const pageUrl = "https://gearhub.ca/products/rocky-mountain-instinct-alloy-frame-no-shock-2023";

describe("validateStage ecwid regression", () => {
  beforeEach(() => {
    vi.spyOn(apiClientModule, "markListingUnsupportedRemote").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not mark a Gearhub frame unsupported when structured product evidence exists", async () => {
    const shellHtml = readFileSync(path.join(fixturesDir, "gearhub-shell.html"), "utf8");
    vi.spyOn(extractListingModule, "classifyListingRelevance").mockResolvedValue({
      supported: false,
      reason: "not_a_product_listing",
    });

    await expect(
      validateStage({
        pageText: "Skip to main content",
        html: shellHtml,
        pageUrl,
        listingId: "00000000-0000-0000-0000-000000000099",
        itemKind: "component",
      })
    ).resolves.toBeUndefined();

    expect(apiClientModule.markListingUnsupportedRemote).not.toHaveBeenCalled();
  });
});
