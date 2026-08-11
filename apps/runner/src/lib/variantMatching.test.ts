import { describe, expect, it } from "vitest";
import {
  matchShopifyVariant,
  parseVariantDimensions,
  type ShopifyVariantRecord,
} from "./variantMatching.js";

const variants: ShopifyVariantRecord[] = [
  {
    id: 1,
    price: 429999,
    public_title: 'Grey/Beige / XSmall (27.5")',
    available: false,
  },
  {
    id: 2,
    price: 429999,
    public_title: 'Grey/Beige / Medium (29")',
    available: true,
  },
  {
    id: 3,
    price: 429999,
    public_title: 'Grey/Beige / Large (29")',
    available: true,
  },
];

describe("parseVariantDimensions", () => {
  it("normalizes retailer size aliases and wheel notation", () => {
    expect(parseVariantDimensions('Grey/Beige / Medium (29")')).toEqual({
      frameSize: "M",
      wheelSizeInches: "29",
    });
    expect(parseVariantDimensions("X-Large 27.5")).toEqual({
      frameSize: "XL",
      wheelSizeInches: "27.5",
    });
    expect(parseVariantDimensions("650b Small")).toEqual({
      frameSize: "S",
      wheelSizeInches: "27.5",
    });
  });
});

describe("matchShopifyVariant", () => {
  it("returns the unique variant for a canonical size and wheel size", () => {
    const match = matchShopifyVariant(variants, { frameSize: "M", wheelSizeInches: "29" });
    expect(match?.id).toBe(2);
  });

  it("returns null when multiple variants match the same dimensions", () => {
    const ambiguous: ShopifyVariantRecord[] = [
      { id: 10, price: 100, public_title: 'Red / Medium (29")', available: true },
      { id: 11, price: 100, public_title: 'Blue / Medium (29")', available: true },
    ];
    expect(matchShopifyVariant(ambiguous, { frameSize: "M", wheelSizeInches: "29" })).toBeNull();
  });

  it("returns null when no variant matches the requested configuration", () => {
    expect(matchShopifyVariant(variants, { frameSize: "XL", wheelSizeInches: "29" })).toBeNull();
  });
});
