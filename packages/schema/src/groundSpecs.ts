import type { Spec } from "./spec.js";

export interface SpecGroundingResult {
  grounded: boolean;
  groundedFields: string[];
  ungroundedFields: string[];
  specs: Spec;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function numberVariants(value: number): string[] {
  const variants = new Set<string>();
  variants.add(String(value));
  variants.add(value.toFixed(2));
  variants.add(value.toFixed(1));
  variants.add(value.toFixed(0));
  return [...variants];
}

function isNumberGrounded(value: number, normalizedSource: string): boolean {
  const variants = numberVariants(value);
  if (variants.some((variant) => normalizedSource.includes(variant))) return true;
  const candidateTokens = normalizedSource.match(/[$€£]?\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?/g) ?? [];
  const normalizedCandidates = candidateTokens.map((token) => token.replace(/[^0-9.]/g, "")).filter(Boolean);
  return normalizedCandidates.some((candidate) => variants.includes(candidate));
}

function isStringGrounded(value: string, normalizedSource: string): boolean {
  const normalizedValue = normalizeText(value);
  if (normalizedValue.length === 0) return false;
  return normalizedSource.includes(normalizedValue);
}

/**
 * Grounding for Spec extraction: each populated field must appear in the source text.
 * Returns only grounded fields in the output specs bag.
 */
export function groundSpecs(extraction: Spec, sourceText: string): SpecGroundingResult {
  const normalizedSource = normalizeText(sourceText);
  const groundedFields: string[] = [];
  const ungroundedFields: string[] = [];
  const specs: Spec = {};

  for (const [field, value] of Object.entries(extraction) as [keyof Spec, Spec[keyof Spec]][]) {
    if (value === undefined || value === null) continue;
    const ok =
      typeof value === "number"
        ? isNumberGrounded(value, normalizedSource)
        : isStringGrounded(String(value), normalizedSource);
    if (ok) {
      groundedFields.push(field);
      (specs as Record<string, unknown>)[field] = value;
    } else {
      ungroundedFields.push(field);
    }
  }

  return {
    grounded: groundedFields.length > 0 && ungroundedFields.length === 0,
    groundedFields,
    ungroundedFields,
    specs,
  };
}
