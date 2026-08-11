import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as extractListingModule from "../inference/extractListing.js";
import * as apiClientModule from "../lib/apiClient.js";
import { validateStage, UnsupportedListingError } from "./validateStage.js";

describe("validateStage", () => {
  beforeEach(() => {
    vi.spyOn(apiClientModule, "markListingUnsupportedRemote").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws UnsupportedListingError when relevance check fails", async () => {
    vi.spyOn(extractListingModule, "classifyListingRelevance").mockResolvedValue({
      supported: false,
      reason: "not_mtb_related",
    });

    await expect(
      validateStage({
        pageText: "Premium yoga mat $29.99",
        listingId: "00000000-0000-0000-0000-000000000099",
        itemKind: "component",
      })
    ).rejects.toBeInstanceOf(UnsupportedListingError);
  });

  it("passes when listing is MTB related", async () => {
    vi.spyOn(extractListingModule, "classifyListingRelevance").mockResolvedValue({
      supported: true,
      reason: "mtb_related",
    });

    await expect(
      validateStage({
        pageText: "Rocky Mountain Instinct frame $2999",
        listingId: "00000000-0000-0000-0000-000000000099",
        itemKind: "component",
      })
    ).resolves.toBeUndefined();
  });
});
