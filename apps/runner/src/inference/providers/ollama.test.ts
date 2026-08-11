import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider } from "./ollama.js";

describe("createOllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts schema-constrained generate requests and parses responses", async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      expect(url).toBe("http://localhost:11434/api/generate");
      const body = JSON.parse(String(options?.body));
      expect(body.model).toBe("test-model");
      expect(body.format).toBeTypeOf("object");
      expect(body.prompt).toContain("PAGE TEXT:");
      expect(body.prompt).toContain("Test Wheel $100.00");
      return {
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            title: "Test Wheel",
            price: 100,
            currency: "USD",
            inStock: true,
            brand: null,
            modelYear: null,
          }),
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaProvider({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      model: "test-model",
    });

    const result = await provider.extractListing("Test Wheel $100.00");
    expect(result.title).toBe("Test Wheel");
    expect(result.price).toBe(100);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("surfaces transport errors with status text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => "service unavailable",
      })) as typeof fetch
    );

    const provider = createOllamaProvider({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      model: "test-model",
    });

    await expect(provider.extractListing("page")).rejects.toThrow(/Ollama request failed: 503/);
  });
});
