import { SpecSchema, type Spec } from "@framer/schema";
import { zodToJsonSchema } from "zod-to-json-schema";

const specExtractionSchema = SpecSchema;

export function getSpecExtractionJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(specExtractionSchema, { $refStrategy: "none" }) as Record<string, unknown>;
}

export function buildSpecExtractionPromptPrefix(): string {
  return `Extract structured mountain bike product specifications from the page text below.
Only include values explicitly stated on the page. Use millimeters for lengths, degrees for angles.
Return JSON matching the schema. Omit fields not present on the page.

Page text:
`;
}

export function buildResearchAnswerPromptPrefix(question: string, excerpts: string): string {
  return `You are summarizing MTB reference material to answer a user question.
Use ONLY facts present in the excerpts. Cite which source supports each claim.
If the excerpts do not contain enough data, say what is missing.

Question: ${question}

Reference excerpts:
${excerpts}

Return JSON: { "answer": "..." }
`;
}

export const ResearchAnswerSchema = { answer: "" };
