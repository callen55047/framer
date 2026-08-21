import { z } from "zod";
import { runInference } from "../pools/inferencePool.js";
import { config, reloadInferenceFromEnv } from "../config.js";
import { createInferenceProvider } from "./createProvider.js";
import type { InferenceProvider } from "./types.js";
import type { Spec } from "@framer/schema";

let activeProvider = createInferenceProvider(config.inference);

export function setInferenceProviderForSpecTests(provider: InferenceProvider): void {
  activeProvider = provider;
}

export function resetSpecInferenceProvider(): void {
  reloadInferenceFromEnv();
  activeProvider = createInferenceProvider(config.inference);
}

const ResearchAnswerSchema = z.object({
  answer: z.string().min(1),
});

export async function extractProductSpecs(pageText: string): Promise<Spec> {
  return runInference(() => activeProvider.extractProductSpecs(pageText));
}

export async function synthesizeResearchAnswer(question: string, excerpts: string): Promise<string> {
  return runInference(() => activeProvider.synthesizeResearchAnswer(question, excerpts));
}

export { ResearchAnswerSchema };
