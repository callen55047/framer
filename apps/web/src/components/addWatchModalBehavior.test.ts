import { describe, expect, it, vi } from "vitest";
import { completeAddWatch } from "./addWatchModalBehavior.js";

describe("completeAddWatch", () => {
  it("refreshes the watchlist and closes the modal after a successful add", () => {
    const onAdded = vi.fn();
    const onClose = vi.fn();

    completeAddWatch(onAdded, onClose);

    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
