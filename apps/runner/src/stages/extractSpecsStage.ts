import { groundSpecs, type Spec } from "@framer/schema";
import { extractProductSpecs } from "../inference/extractSpecs.js";
import { truncateReferenceText } from "../lib/referencePageText.js";

export interface ExtractSpecsStageResult {
  extraction: Spec;
  groundedSpecs: Spec;
  groundedFields: string[];
  ungroundedFields: string[];
}

export async function extractSpecsStage(pageText: string): Promise<ExtractSpecsStageResult> {
  const truncated = truncateReferenceText(pageText, 12000);
  const extraction = await extractProductSpecs(truncated);
  const grounding = groundSpecs(extraction, truncated);
  if (grounding.groundedFields.length === 0) {
    throw new Error(
      `spec extraction failed grounding: ungrounded ${grounding.ungroundedFields.join(", ") || "all fields"}`
    );
  }
  return {
    extraction,
    groundedSpecs: grounding.specs,
    groundedFields: grounding.groundedFields,
    ungroundedFields: grounding.ungroundedFields,
  };
}
