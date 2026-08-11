import { describe, expect, it } from "vitest";
import { formatUnsupportedListingMessage, ListingRelevanceSchema } from "@framer/schema";
import { CreateWatchInputSchema } from "@framer/schema";

describe("CreateWatchInputSchema", () => {
  it("requires category for component item kind", () => {
    const result = CreateWatchInputSchema.safeParse({
      url: "https://example.com/frame",
      itemKind: "component",
    });
    expect(result.success).toBe(false);
  });

  it("accepts complete bike without required size selectors", () => {
    const result = CreateWatchInputSchema.safeParse({
      url: "https://example.com/bike",
      itemKind: "complete_bike",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional frame and wheel filters for complete bikes", () => {
    const result = CreateWatchInputSchema.safeParse({
      url: "https://example.com/bike",
      itemKind: "complete_bike",
      frameSize: "M",
      wheelSizeInches: "29",
    });
    expect(result.success).toBe(true);
  });
});

describe("ListingRelevanceSchema", () => {
  it("parses unsupported yoga mat classification", () => {
    const parsed = ListingRelevanceSchema.parse({
      supported: false,
      reason: "not_mtb_related",
    });
    expect(parsed.supported).toBe(false);
    expect(formatUnsupportedListingMessage(parsed.reason)).toContain("mountain bike related");
  });
});
