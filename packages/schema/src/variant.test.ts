import { describe, expect, it } from "vitest";
import {
  computeVariantAggregate,
  filterVariantsByDiscovery,
  type ExtractedVariant,
} from "./variant.js";

const sampleVariants: ExtractedVariant[] = [
  {
    providerId: "1",
    label: "M / 29",
    options: [],
    frameSize: "M",
    wheelSizeInches: "29",
    price: 4299.99,
    currency: "CAD",
    inStock: true,
  },
  {
    providerId: "2",
    label: "L / 29",
    options: [],
    frameSize: "L",
    wheelSizeInches: "29",
    price: 4599.99,
    currency: "CAD",
    inStock: false,
  },
];

describe("computeVariantAggregate", () => {
  it("returns lowest in-stock price and availability counts", () => {
    const aggregate = computeVariantAggregate(sampleVariants);
    expect(aggregate.lowestInStockPrice).toBe(4299.99);
    expect(aggregate.highestInStockPrice).toBe(4299.99);
    expect(aggregate.availableCount).toBe(1);
    expect(aggregate.totalCount).toBe(2);
    expect(aggregate.inStock).toBe(true);
  });
});

describe("filterVariantsByDiscovery", () => {
  it("filters variants by frame and wheel size", () => {
    const filtered = filterVariantsByDiscovery(sampleVariants, {
      frameSize: "M",
      wheelSizeInches: "29",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.providerId).toBe("1");
  });
});
