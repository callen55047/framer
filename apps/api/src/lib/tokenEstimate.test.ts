import { describe, expect, it } from "vitest";
import { estimateMessagesTokens, estimateTokens } from "./tokenEstimate.js";

describe("tokenEstimate", () => {
  it("estimates tokens as ceil(chars / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("sums message content and tool payloads", () => {
    const total = estimateMessagesTokens([
      { content: "hello" },
      { content: "world", toolArgs: { id: "1" }, toolResult: { ok: true } },
    ]);
    expect(total).toBeGreaterThan(0);
  });
});
