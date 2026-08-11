import { describe, expect, it } from "vitest";
import { FetchHttpError } from "./fetchStage.js";

describe("FetchHttpError", () => {
  it("captures HTTP status for scheduled failure handling", () => {
    const err = new FetchHttpError(404, "https://example.com/missing");
    expect(err.status).toBe(404);
    expect(err.message).toContain("404");
  });
});
