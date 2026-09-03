import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { loadInferenceConfigFromEnv } from "./loadConfig.js";

const ENV_KEYS = [
  "INFERENCE_PROVIDER",
  "INFERENCE_BASE_URL",
  "INFERENCE_MODEL",
  "LM_STUDIO_BASE_URL",
  "LM_STUDIO_MODEL",
  "INFERENCE_CHAT_TEMPERATURE",
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

  it("defaults to lmstudio with the gemma default model", () => {
    const config = loadInferenceConfigFromEnv();
    expect(config).toEqual({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      model: "google/gemma-4-e2b",
      chatTemperature: 0.3,
    });
  });

  it("LM_STUDIO_MODEL and LM_STUDIO_BASE_URL override the defaults", () => {
    process.env.LM_STUDIO_BASE_URL = "http://localhost:1234/v1";
    process.env.LM_STUDIO_MODEL = "qwen3.5-9b-deepseek-v4-flash";
    const config = loadInferenceConfigFromEnv();
    expect(config.baseUrl).toBe("http://localhost:1234/v1");
    expect(config.model).toBe("qwen3.5-9b-deepseek-v4-flash");
  });

  it("INFERENCE_MODEL takes precedence over LM_STUDIO_MODEL", () => {
    process.env.LM_STUDIO_MODEL = "qwen3.5-9b-deepseek-v4-flash";
    process.env.INFERENCE_MODEL = "some-other-model";
    const config = loadInferenceConfigFromEnv();
    expect(config.model).toBe("some-other-model");
  });

  it("treats a blank INFERENCE_MODEL as unset", () => {
    process.env.LM_STUDIO_MODEL = "qwen3.5-9b-deepseek-v4-flash";
    process.env.INFERENCE_MODEL = "";
    const config = loadInferenceConfigFromEnv();
    expect(config.model).toBe("qwen3.5-9b-deepseek-v4-flash");
  });

  it("reads INFERENCE_CHAT_TEMPERATURE and falls back on garbage", () => {
    process.env.INFERENCE_CHAT_TEMPERATURE = "0.7";
    expect(loadInferenceConfigFromEnv().chatTemperature).toBe(0.7);
    process.env.INFERENCE_CHAT_TEMPERATURE = "not-a-number";
    expect(loadInferenceConfigFromEnv().chatTemperature).toBe(0.3);
  });

  it("rejects invalid provider", () => {
    process.env.INFERENCE_PROVIDER = "ollama";
    expect(() => loadInferenceConfigFromEnv()).toThrow(/Invalid INFERENCE_PROVIDER/);
  });
});
