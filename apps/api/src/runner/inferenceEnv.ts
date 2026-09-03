import { config } from "../config.js";

/**
 * Copies the API's inference config into process.env so the runner's
 * `loadInferenceConfigFromEnv()` (which is env-only) picks it up. Shared by
 * the standalone integrated runner (`startRunner.ts`) and the API chat
 * service, which both need the same provider/model resolved before creating
 * an inference provider.
 */
export function applyRunnerInferenceEnv(): void {
  process.env.INFERENCE_PROVIDER = config.runner.inferenceProvider;
  if (config.runner.inferenceBaseUrl) {
    process.env.INFERENCE_BASE_URL = config.runner.inferenceBaseUrl;
  } else {
    delete process.env.INFERENCE_BASE_URL;
  }
  if (config.runner.inferenceModel) {
    process.env.INFERENCE_MODEL = config.runner.inferenceModel;
  } else {
    delete process.env.INFERENCE_MODEL;
  }
  process.env.LM_STUDIO_BASE_URL = config.runner.lmStudioBaseUrl;
  if (config.runner.lmStudioModel) {
    process.env.LM_STUDIO_MODEL = config.runner.lmStudioModel;
  } else {
    delete process.env.LM_STUDIO_MODEL;
  }
}
