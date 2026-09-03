import { INFERENCE_PROVIDER_KINDS, type InferenceConfig, type InferenceProviderKind } from "./types.js";

export const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";
export const DEFAULT_LM_STUDIO_MODEL = "google/gemma-4-e2b";

/** Reads an env var, treating an unset or blank value as absent. */
function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  return value;
}

function parseProvider(raw: string | undefined): InferenceProviderKind {
  const value = raw ?? "lmstudio";
  if ((INFERENCE_PROVIDER_KINDS as readonly string[]).includes(value)) {
    return value as InferenceProviderKind;
  }
  throw new Error(
    `Invalid INFERENCE_PROVIDER "${value}". Must be one of: ${INFERENCE_PROVIDER_KINDS.join(", ")}.`
  );
}

export const DEFAULT_CHAT_TEMPERATURE = 0.3;

function parseChatTemperature(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_CHAT_TEMPERATURE;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0 || value > 2) return DEFAULT_CHAT_TEMPERATURE;
  return value;
}

/**
 * Reads inference provider settings from the environment. Both the standalone
 * Runner and the API integrated runner set these vars before pipeline work.
 */
export function loadInferenceConfigFromEnv(): InferenceConfig {
  const provider = parseProvider(readEnv("INFERENCE_PROVIDER"));
  const chatTemperature = parseChatTemperature(readEnv("INFERENCE_CHAT_TEMPERATURE"));

  return {
    provider,
    chatTemperature,
    baseUrl: readEnv("INFERENCE_BASE_URL") ?? readEnv("LM_STUDIO_BASE_URL") ?? DEFAULT_LM_STUDIO_BASE_URL,
    model: readEnv("INFERENCE_MODEL") ?? readEnv("LM_STUDIO_MODEL") ?? DEFAULT_LM_STUDIO_MODEL,
  };
}
