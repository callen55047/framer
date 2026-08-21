import { SPEC_FIELD_LABELS, SpecSchema, type ProductCategory, type Spec } from "@framer/schema";

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

export interface CompatibilityResult {
  compatible: boolean;
  violations: CompatibilityViolation[];
  missingSpecs: string[];
  products: {
    a: { id: string; brand: string; model: string; category: ProductCategory };
    b: { id: string; brand: string; model: string; category: ProductCategory };
  };
}

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

export function checkCompatibility(a: CompatibilityProduct, b: CompatibilityProduct): CompatibilityResult {
  const violations: CompatibilityViolation[] = [];
  const missingSpecs: string[] = [];

  compareEqualField("wheelSizeInches", SPEC_FIELD_LABELS.wheelSizeInches, a.specs, b.specs, violations, missingSpecs);
  compareEqualField("steererStandard", SPEC_FIELD_LABELS.steererStandard, a.specs, b.specs, violations, missingSpecs);
  compareEqualField("axleStandard", SPEC_FIELD_LABELS.axleStandard, a.specs, b.specs, violations, missingSpecs);
  compareEqualField("brakeMount", SPEC_FIELD_LABELS.brakeMount, a.specs, b.specs, violations, missingSpecs);
  checkForkTravel(a, b, violations, missingSpecs);

  const uniqueMissing = [...new Set(missingSpecs)];
  return {
    compatible: violations.length === 0,
    violations,
    missingSpecs: uniqueMissing,
    products: {
      a: { id: a.id, brand: a.brand, model: a.model, category: a.category },
      b: { id: b.id, brand: b.brand, model: b.model, category: b.category },
    },
  };
}
