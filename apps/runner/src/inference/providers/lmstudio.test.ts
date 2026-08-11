import { afterEach, describe, expect, it, vi } from "vitest";
import { createLmStudioProvider } from "./lmstudio.js";

describe("createLmStudioProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts OpenAI-compatible chat completions with json_schema response_format", async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      expect(url).toBe("http://localhost:1234/v1/chat/completions");
      const body = JSON.parse(String(options?.body));
      expect(body.model).toBe("lm-model");
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.messages[0].content).toContain("PAGE TEXT:");
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Test Fork",
                  price: 899,
                  currency: "USD",
                  inStock: true,
                  brand: null,
                  modelYear: null,
                }),
              },
            },
          ],
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createLmStudioProvider({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      model: "lm-model",
    });

    const result = await provider.extractListing("RockShox Lyrik $899.00");
    expect(result.title).toBe("Test Fork");
    expect(result.price).toBe(899);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws when chat completion content is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [] }),
      })) as typeof fetch
    );

    const provider = createLmStudioProvider({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      model: "lm-model",
    });

    await expect(provider.extractListing("page")).rejects.toThrow(/missing choices/);
  });
});
