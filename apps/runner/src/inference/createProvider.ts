import { createLmStudioProvider } from "./providers/lmstudio.js";
import { createOllamaProvider } from "./providers/ollama.js";
import type { InferenceConfig, InferenceProvider } from "./types.js";

export function createInferenceProvider(config: InferenceConfig): InferenceProvider {
  switch (config.provider) {
    case "ollama":
      return createOllamaProvider(config);
    case "lmstudio":
      return createLmStudioProvider(config);
    default:
      throw new Error(`Unsupported inference provider: ${config.provider satisfies never}`);
  }
}
