import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { loadInferenceConfigFromEnv } from "./loadConfig.js";

const ENV_KEYS = [
  "INFERENCE_PROVIDER",
  "INFERENCE_BASE_URL",
  "INFERENCE_MODEL",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "LM_STUDIO_BASE_URL",
  "LM_STUDIO_MODEL",
] as const;

describe("loadInferenceConfigFromEnv", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("defaults to ollama with legacy env vars", () => {
    process.env.OLLAMA_BASE_URL = "http://ollama:11434";
    process.env.OLLAMA_MODEL = "llama3.2";
    const config = loadInferenceConfigFromEnv();
    expect(config).toEqual({
      provider: "ollama",
      baseUrl: "http://ollama:11434",
      model: "llama3.2",
    });
  });

  it("selects lmstudio with lm studio defaults", () => {
    process.env.INFERENCE_PROVIDER = "lmstudio";
    const config = loadInferenceConfigFromEnv();
    expect(config.provider).toBe("lmstudio");
    expect(config.baseUrl).toBe("http://localhost:1234/v1");
    expect(config.model).toBe("local-model");
  });

  it("rejects invalid provider", () => {
    process.env.INFERENCE_PROVIDER = "openai";
    expect(() => loadInferenceConfigFromEnv()).toThrow(/Invalid INFERENCE_PROVIDER/);
  });
});
