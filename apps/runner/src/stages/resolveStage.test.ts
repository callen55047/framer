import { describe, expect, it, vi } from "vitest";
import * as apiClient from "../lib/apiClient.js";
import { resolveStage } from "./resolveStage.js";

describe("resolveStage", () => {
  it("passes expectedCategory to product resolution", async () => {
    const spy = vi.spyOn(apiClient, "resolveProductRemote").mockResolvedValue({
      productId: "00000000-0000-0000-0000-000000000001",
      grade: "new",
    });

    await resolveStage(
      {
        title: "Transition Spur Frame",
        price: 2999,
        currency: "USD",
        inStock: true,
        brand: "Transition",
        modelYear: 2024,
      },
      "frame"
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "frame",
      })
    );
  });
});
