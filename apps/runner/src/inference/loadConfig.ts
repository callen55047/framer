import { INFERENCE_PROVIDER_KINDS, type InferenceConfig, type InferenceProviderKind } from "./types.js";

function parseProvider(raw: string | undefined): InferenceProviderKind {
  const value = raw ?? "ollama";
  if ((INFERENCE_PROVIDER_KINDS as readonly string[]).includes(value)) {
    return value as InferenceProviderKind;
  }
  throw new Error(
    `Invalid INFERENCE_PROVIDER "${value}". Must be one of: ${INFERENCE_PROVIDER_KINDS.join(", ")}.`
  );
}

/**
 * Reads inference provider settings from the environment. Both the standalone
 * Runner and the API integrated runner set these vars before pipeline work.
 */
export function loadInferenceConfigFromEnv(): InferenceConfig {
  const provider = parseProvider(process.env.INFERENCE_PROVIDER);

  if (provider === "ollama") {
    return {
      provider,
      baseUrl: process.env.INFERENCE_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      model: process.env.INFERENCE_MODEL ?? process.env.OLLAMA_MODEL ?? "llama3.2",
    };
  }

  return {
    provider,
    baseUrl:
      process.env.INFERENCE_BASE_URL ?? process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234/v1",
    model:
      process.env.INFERENCE_MODEL ??
      process.env.LM_STUDIO_MODEL ??
      process.env.OLLAMA_MODEL ??
      "local-model",
  };
}
