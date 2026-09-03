import { describe, expect, it } from "vitest";
import { CHAT_TOOL_LABELS, toolActivityLabel, toolDoneLabel } from "./chatToolLabels.js";

/** Mirror of CHAT_TOOLS names in apps/api/src/lib/chatTools.ts. Update both when adding a tool. */
const EXPECTED_TOOL_NAMES = [
  "listWatches",
  "listTasks",
  "searchProducts",
  "getListing",
  "getProductListings",
  "getPriceHistory",
  "listRetailers",
  "searchReference",
  "fetchReferencePage",
  "checkCompatibility",
  "findCompatibleProducts",
  "enqueueResearch",
  "listSessionSummaries",
  "getSessionSummary",
  "getHandbookEntry",
  "askClarifyingQuestion",
];

describe("chatToolLabels", () => {
  it("has an active and done label for every chat tool", () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(CHAT_TOOL_LABELS[name]?.active, name).toBeTruthy();
      expect(CHAT_TOOL_LABELS[name]?.done, name).toBeTruthy();
    }
    expect(Object.keys(CHAT_TOOL_LABELS).sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it("falls back to generic labels for unknown tools", () => {
    expect(toolActivityLabel("mystery")).toBe("Using mystery…");
    expect(toolDoneLabel("mystery")).toBe("Used mystery");
    expect(toolDoneLabel(null)).toBe("Used a tool");
  });
});
