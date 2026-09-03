import type { ListingExtraction } from "./extraction.js";
import type { GroundingResult } from "./extraction.js";

/**
 * Grounding: every value produced by Extraction must normalize-match text
 * actually present in the source Artifact. This is the defense against
 * schema-valid-but-wrong output — constrained decoding (LM Studio's
 * `response_format.json_schema` parameter) guarantees shape, not truth. See CONTEXT.md#Grounding.
 *
 * Deliberately pure and dependency-free so it can be unit tested and reused
 * by the offline replay harness without touching the network or the model.
 */

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Strips currency symbols, thousands separators, and whitespace: "$1,899.00" -> "1899.00" */
function normalizeCurrencyToken(text: string): string {
  return text.replace(/[^0-9.]/g, "");
}

function numberVariants(value: number): string[] {
  const variants = new Set<string>();
  variants.add(String(value));
  variants.add(value.toFixed(2));
  variants.add(value.toFixed(0));
  if (Number.isInteger(value)) variants.add(value.toFixed(0));
  return [...variants];
}

/**
 * Checks whether a numeric field (price) appears in the source text once
 * currency symbols and thousands separators are stripped from every
 * "$1,234.56"-shaped token in the source.
 */
function isPriceGrounded(price: number, normalizedSource: string): boolean {
  const candidateTokens = normalizedSource.match(/[$€£]?\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?/g) ?? [];
  const normalizedCandidates = candidateTokens.map(normalizeCurrencyToken).filter(Boolean);
  const variants = numberVariants(price);
  return normalizedCandidates.some((candidate) => variants.includes(candidate) || variants.includes(String(Number(candidate))));
}

function isStringGrounded(value: string, normalizedSource: string): boolean {
  const normalizedValue = normalizeText(value);
  if (normalizedValue.length === 0) return false;
  return normalizedSource.includes(normalizedValue);
}

function isYearGrounded(year: number, normalizedSource: string): boolean {
  return normalizedSource.includes(String(year));
}

/**
 * Runs Grounding over a raw model extraction against the source Artifact
 * text (HTML with tags stripped). `inStock` and `currency` are not grounded
 * against raw text — currency is near-universally implicit (a US retailer
 * page rarely spells out "USD"), and in-stock status is usually a UI
 * affordance (button state, CSS class) rather than literal text, so neither
 * field is meaningfully checkable this way; both are trusted alongside the
 * grounded fields.
 */
export function groundExtraction(extraction: ListingExtraction, sourceText: string): GroundingResult {
  const normalizedSource = normalizeText(sourceText);
  const groundedFields: string[] = [];
  const ungroundedFields: string[] = [];

  const check = (field: string, ok: boolean) => {
    (ok ? groundedFields : ungroundedFields).push(field);
  };

  check("title", isStringGrounded(extraction.title, normalizedSource));
  check("price", isPriceGrounded(extraction.price, normalizedSource));
  if (extraction.brand !== null) {
    check("brand", isStringGrounded(extraction.brand, normalizedSource));
  }
  if (extraction.modelYear !== null) {
    check("modelYear", isYearGrounded(extraction.modelYear, normalizedSource));
  }

  // price and title are load-bearing: if either is ungrounded, reject the
  // whole extraction rather than persisting a partially-trusted price point.
  const critical = ["title", "price"];
  const grounded = critical.every((field) => groundedFields.includes(field));

  return { grounded, groundedFields, ungroundedFields };
}
