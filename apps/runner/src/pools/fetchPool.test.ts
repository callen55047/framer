import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const ENV_KEYS = ["FETCH_ALLOWLIST_MODE"] as const;

describe("assertFetchDomainAllowed", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
    vi.resetModules();
  });

  it("allows known retailer domains", async () => {
    const { assertFetchDomainAllowed } = await import("./fetchPool.js");
    expect(() =>
      assertFetchDomainAllowed("https://www.jensonusa.com/dt-swiss-wheelset")
    ).not.toThrow();
  });

  it("throws for unknown domains in enforce mode", async () => {
    process.env.FETCH_ALLOWLIST_MODE = "enforce";
    const { assertFetchDomainAllowed } = await import("./fetchPool.js");
    expect(() => assertFetchDomainAllowed("https://www.ebay.com/itm/123")).toThrow(
      /not in the reference source registry/
    );
  });

  it("warns but does not throw for unknown domains in warn mode", async () => {
    process.env.FETCH_ALLOWLIST_MODE = "warn";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { assertFetchDomainAllowed } = await import("./fetchPool.js");
    expect(() => assertFetchDomainAllowed("https://www.ebay.com/itm/123")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unknown domain"));
    warnSpy.mockRestore();
  });
});
