import {
  BUILD_SLOT_TO_CATEGORY,
  SPEC_FIELD_LABELS,
  SpecSchema,
  type BuildSlot,
  type ProductCategory,
  type Spec,
} from "@framer/schema";

export interface CompatibilityProduct {
  id: string;
  brand: string;
  model: string;
  category: ProductCategory;
  specs: Spec;
}

export interface CompatibilityViolation {
  rule: string;
  message: string;
}

export type CompatibilityVerdict = "compatible" | "incompatible" | "unknown";

export interface CompatibilityResult {
  /** @deprecated Use verdict — kept for callers checking boolean compatibility */
  compatible: boolean;
  verdict: CompatibilityVerdict;
  violations: CompatibilityViolation[];
  missingSpecs: string[];
  products: {
    a: { id: string; brand: string; model: string; category: ProductCategory };
    b: { id: string; brand: string; model: string; category: ProductCategory };
  };
}

export interface FindCompatibleProductsResult {
  verdict: CompatibilityVerdict;
  forProduct: { id: string; brand: string; model: string; category: ProductCategory };
  slot: BuildSlot;
  requiredSpecs: string[];
  missingSpecs: string[];
  matches: Array<{
    product: { id: string; brand: string; model: string; category: ProductCategory };
    verdict: CompatibilityVerdict;
    violations: CompatibilityViolation[];
    missingSpecs: string[];
  }>;
}

const SLOT_REQUIRED_SPECS: Record<BuildSlot, (keyof Spec)[]> = {
  frame: ["wheelSizeInches"],
  fork: ["steererStandard", "steererDiameterMm", "axleStandard", "maxForkTravelMm"],
  wheelset: ["wheelSizeInches", "axleStandard"],
  drivetrain: [],
  brakes: ["brakeMount"],
  cockpit: ["steererStandard", "steererDiameterMm", "barClampDiameterMm"],
  tires: ["wheelSizeInches"],
};

function parseSpecs(raw: unknown): Spec {
  if (typeof raw === "string") {
    try {
      return SpecSchema.parse(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  try {
    return SpecSchema.parse(raw ?? {});
  } catch {
    return {};
  }
}

export function parseProductSpecs(raw: unknown): Spec {
  return parseSpecs(raw);
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compareEqualField(
  field: keyof Spec,
  label: string,
  a: Spec,
  b: Spec,
  violations: CompatibilityViolation[],
  missingSpecs: string[]
): void {
  const left = a[field];
  const right = b[field];
  if (left === undefined && right === undefined) return;
  if (left === undefined || right === undefined) {
    missingSpecs.push(label);
    return;
  }
  if (typeof left === "number" && typeof right === "number") {
    if (left !== right) {
      violations.push({
        rule: field,
        message: `${label} mismatch: ${left} vs ${right}`,
      });
    }
    return;
  }
  if (normalizeToken(String(left)) !== normalizeToken(String(right))) {
    violations.push({
      rule: field,
      message: `${label} mismatch: ${left} vs ${right}`,
    });
  }
}

function checkForkTravel(
  a: CompatibilityProduct,
  b: CompatibilityProduct,
  violations: CompatibilityViolation[],
  missingSpecs: string[]
): void {
  const frame = a.category === "frame" ? a : b.category === "frame" ? b : null;
  const fork = a.category === "fork" ? a : b.category === "fork" ? b : null;
  if (!frame || !fork) return;

  const frameMax = frame.specs.maxForkTravelMm;
  const forkTravel = fork.specs.maxForkTravelMm;
  if (frameMax === undefined || forkTravel === undefined) {
    if (frameMax === undefined) missingSpecs.push(SPEC_FIELD_LABELS.maxForkTravelMm + " (frame)");
    if (forkTravel === undefined) missingSpecs.push("Fork travel (mm) on fork product");
    return;
  }
  if (forkTravel > frameMax) {
    violations.push({
      rule: "maxForkTravelMm",
      message: `Fork travel ${forkTravel}mm exceeds frame maximum ${frameMax}mm`,
    });
  }
}

function deriveVerdict(
  violations: CompatibilityViolation[],
  missingSpecs: string[],
  a: Spec,
  b: Spec
): CompatibilityVerdict {
  if (violations.length > 0) return "incompatible";
  if (missingSpecs.length > 0) return "unknown";
  const aPopulated = Object.values(a).some((value) => value !== undefined);
  const bPopulated = Object.values(b).some((value) => value !== undefined);
  if (!aPopulated && !bPopulated) return "unknown";
  return "compatible";
}

export function checkCompatibility(a: CompatibilityProduct, b: CompatibilityProduct): CompatibilityResult {
  const violations: CompatibilityViolation[] = [];
  const missingSpecs: string[] = [];

  compareEqualField("wheelSizeInches", SPEC_FIELD_LABELS.wheelSizeInches, a.specs, b.specs, violations, missingSpecs);
  compareEqualField("steererStandard", SPEC_FIELD_LABELS.steererStandard, a.specs, b.specs, violations, missingSpecs);
  compareEqualField("steererDiameterMm", SPEC_FIELD_LABELS.steererDiameterMm, a.specs, b.specs, violations, missingSpecs);
  compareEqualField("barClampDiameterMm", SPEC_FIELD_LABELS.barClampDiameterMm, a.specs, b.specs, violations, missingSpecs);
  compareEqualField("axleStandard", SPEC_FIELD_LABELS.axleStandard, a.specs, b.specs, violations, missingSpecs);
  compareEqualField("brakeMount", SPEC_FIELD_LABELS.brakeMount, a.specs, b.specs, violations, missingSpecs);
  compareEqualField(
    "bottomBracketStandard",
    SPEC_FIELD_LABELS.bottomBracketStandard,
    a.specs,
    b.specs,
    violations,
    missingSpecs
  );
  compareEqualField(
    "seatpostDiameterMm",
    SPEC_FIELD_LABELS.seatpostDiameterMm,
    a.specs,
    b.specs,
    violations,
    missingSpecs
  );
  checkForkTravel(a, b, violations, missingSpecs);

  const uniqueMissing = [...new Set(missingSpecs)];
  const verdict = deriveVerdict(violations, uniqueMissing, a.specs, b.specs);

  return {
    compatible: verdict === "compatible",
    verdict,
    violations,
    missingSpecs: uniqueMissing,
    products: {
      a: { id: a.id, brand: a.brand, model: a.model, category: a.category },
      b: { id: b.id, brand: b.brand, model: b.model, category: b.category },
    },
  };
}

export function findCompatibleProducts(
  forProduct: CompatibilityProduct,
  candidates: CompatibilityProduct[],
  options: { limit: number; slot: BuildSlot }
): FindCompatibleProductsResult {
  const requiredFields = SLOT_REQUIRED_SPECS[options.slot];
  const requiredSpecs = requiredFields.map((field) => SPEC_FIELD_LABELS[field]);

  const missingOnSource = requiredFields
    .filter((field) => forProduct.specs[field] === undefined)
    .map((field) => SPEC_FIELD_LABELS[field]);

  const matches = candidates
    .map((candidate) => {
      const result = checkCompatibility(forProduct, candidate);
      return {
        product: {
          id: candidate.id,
          brand: candidate.brand,
          model: candidate.model,
          category: candidate.category,
        },
        verdict: result.verdict,
        violations: result.violations,
        missingSpecs: result.missingSpecs,
      };
    })
    .filter((entry) => entry.verdict !== "incompatible")
    .slice(0, options.limit);

  const overallVerdict: CompatibilityVerdict =
    missingOnSource.length > 0 ? "unknown" : matches.some((m) => m.verdict === "compatible") ? "compatible" : "unknown";

  return {
    verdict: overallVerdict,
    forProduct: {
      id: forProduct.id,
      brand: forProduct.brand,
      model: forProduct.model,
      category: forProduct.category,
    },
    slot: options.slot,
    requiredSpecs,
    missingSpecs: missingOnSource,
    matches,
  };
}
