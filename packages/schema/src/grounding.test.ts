import { describe, expect, it } from "vitest";
import { groundExtraction } from "./grounding.js";
import type { ListingExtraction } from "./extraction.js";

function extraction(overrides: Partial<ListingExtraction> = {}): ListingExtraction {
  return {
    title: "DT Swiss XM 1700 SPLINE 29 Wheelset",
    price: 599.99,
    currency: "USD",
    inStock: true,
    brand: "DT Swiss",
    modelYear: null,
    ...overrides,
  };
}

describe("groundExtraction", () => {
  const source =
    "DT Swiss XM 1700 SPLINE 29 Wheelset DT Swiss $599.99 Add to Cart 29-inch aluminum wheelset.";

  it("accepts grounded title and price", () => {
    const result = groundExtraction(extraction(), source);
    expect(result.grounded).toBe(true);
    expect(result.ungroundedFields).not.toContain("title");
    expect(result.ungroundedFields).not.toContain("price");
  });

  it("rejects hallucinated price values", () => {
    const result = groundExtraction(extraction({ price: 1 }), source);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedFields).toContain("price");
  });

  it("rejects hallucinated titles", () => {
    const result = groundExtraction(extraction({ title: "Fake Product Name" }), source);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedFields).toContain("title");
  });

  it("grounds prices with currency formatting in source text", () => {
    const formattedSource = "RockShox Lyrik Ultimate Fork Price: $899.00 Add to Cart";
    const result = groundExtraction(
      extraction({ title: "RockShox Lyrik Ultimate Fork", price: 899 }),
      formattedSource
    );
    expect(result.grounded).toBe(true);
  });
});
