import { describe, expect, it } from "vitest";
import type { ListingVariant } from "./api.js";
import { buildVariantTable } from "./variantTable.js";

const baseVariant = {
  listingId: "listing-1",
  providerId: "provider-1",
  price: 6999,
  currency: "CAD",
  inStock: true,
  firstSeenAt: "2026-08-10T00:00:00.000Z",
  lastSeenAt: "2026-08-10T12:00:00.000Z",
} satisfies Omit<ListingVariant, "id" | "label" | "options" | "frameSize" | "wheelSizeInches">;

function makeVariant(overrides: Partial<ListingVariant> & Pick<ListingVariant, "id" | "label">): ListingVariant {
  return {
    ...baseVariant,
    options: [],
    frameSize: null,
    wheelSizeInches: null,
    ...overrides,
  };
}

describe("buildVariantTable", () => {
  it("splits slash-containing color options for three-axis bike variants", () => {
    const table = buildVariantTable([
      makeVariant({
        id: "v1",
        label: "29 / LG / BLACK/CARBON/BLACK",
        frameSize: "L",
        wheelSizeInches: "29",
      }),
    ]);

    expect(table.columns).toEqual(["frameSize", "wheelSize", "options"]);
    expect(table.rows[0]).toMatchObject({
      frameSize: "L",
      wheelSize: '29"',
      options: "BLACK/CARBON/BLACK",
    });
  });

  it("keeps combined color segments for two-option listings", () => {
    const table = buildVariantTable([
      makeVariant({
        id: "v1",
        label: 'Grey/Beige / Small (29")',
        frameSize: "S",
        wheelSizeInches: "29",
      }),
    ]);

    expect(table.rows[0]?.options).toBe("Grey/Beige");
  });

  it("uses the full label when size fields are missing", () => {
    const table = buildVariantTable([
      makeVariant({
        id: "v1",
        label: "Shimano XT Derailleur — Long Cage",
      }),
    ]);

    expect(table.columns).toEqual(["options"]);
    expect(table.rows[0]?.options).toBe("Shimano XT Derailleur — Long Cage");
    expect(table.rows[0]?.frameSize).toBeNull();
    expect(table.rows[0]?.wheelSize).toBeNull();
  });

  it("sorts by wheel size, then frame size, then options", () => {
    const table = buildVariantTable([
      makeVariant({
        id: "v-lg-29",
        label: "29 / LG / PURPLE/RED",
        frameSize: "L",
        wheelSizeInches: "29",
        options: [],
      }),
      makeVariant({
        id: "v-sm-275",
        label: "27.5 / SM / PURPLE/RED",
        frameSize: "S",
        wheelSizeInches: "27.5",
        options: [],
      }),
      makeVariant({
        id: "v-md-29",
        label: "29 / MD / BLACK/CARBON/BLACK",
        frameSize: "M",
        wheelSizeInches: "29",
        options: [],
      }),
    ]);

    expect(table.rows.map((row) => row.variant.id)).toEqual(["v-sm-275", "v-md-29", "v-lg-29"]);
  });

  it("marks cheapest in-stock rows and stale variants", () => {
    const table = buildVariantTable([
      makeVariant({
        id: "cheap",
        label: "29 / MD / PURPLE/RED",
        frameSize: "M",
        wheelSizeInches: "29",
        price: 5000,
        inStock: true,
        lastSeenAt: "2026-08-10T12:00:00.000Z",
      }),
      makeVariant({
        id: "expensive",
        label: "29 / LG / PURPLE/RED",
        frameSize: "L",
        wheelSizeInches: "29",
        price: 6999,
        inStock: true,
        lastSeenAt: "2026-08-10T12:00:00.000Z",
      }),
      makeVariant({
        id: "stale",
        label: "27.5 / SM / PURPLE/RED",
        frameSize: "S",
        wheelSizeInches: "27.5",
        price: 4500,
        inStock: true,
        lastSeenAt: "2026-08-09T12:00:00.000Z",
      }),
    ]);

    const cheap = table.rows.find((row) => row.variant.id === "cheap");
    const expensive = table.rows.find((row) => row.variant.id === "expensive");
    const stale = table.rows.find((row) => row.variant.id === "stale");

    expect(cheap?.isCheapestInStock).toBe(false);
    expect(expensive?.isCheapestInStock).toBe(false);
    expect(stale?.isCheapestInStock).toBe(true);
    expect(stale?.isStale).toBe(true);
    expect(cheap?.isStale).toBe(false);
  });
});
