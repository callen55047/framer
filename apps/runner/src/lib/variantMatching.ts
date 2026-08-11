import type { FrameSize, VariantPreference, WheelSizeInches } from "@framer/schema";

export interface ShopifyVariantRecord {
  id: number;
  price: number;
  name?: string;
  public_title?: string;
  available?: boolean;
}

const FRAME_ALIASES: Record<string, FrameSize> = {
  xs: "XS",
  xsmall: "XS",
  "x-small": "XS",
  "x small": "XS",
  s: "S",
  small: "S",
  sm: "S",
  m: "M",
  md: "M",
  medium: "M",
  l: "L",
  lg: "L",
  large: "L",
  xl: "XL",
  xlarge: "XL",
  "x-large": "XL",
  "x large": "XL",
  xxl: "XXL",
  xxlarge: "XXL",
  "xx-large": "XXL",
};

const WHEEL_ALIASES: Record<string, WheelSizeInches> = {
  "26": "26",
  '26"': "26",
  "27.5": "27.5",
  '27.5"': "27.5",
  "650b": "27.5",
  "29": "29",
  '29"': "29",
  "700c": "29",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseFrameSize(text: string): FrameSize | null {
  const normalized = normalizeToken(text);
  const aliases = Object.entries(FRAME_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, size] of aliases) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(normalized)) return size;
  }
  return null;
}

function parseWheelSize(text: string): WheelSizeInches | null {
  const normalized = normalizeToken(text);
  if (normalized.includes("650b")) return "27.5";
  const inchMatch = normalized.match(/\b(26|27\.5|29)(?:\s*(?:inch|in|"))?\b/);
  if (inchMatch?.[1] === "26") return "26";
  if (inchMatch?.[1] === "27.5") return "27.5";
  if (inchMatch?.[1] === "29") return "29";
  for (const [alias, size] of Object.entries(WHEEL_ALIASES)) {
    if (normalized.includes(alias)) return size;
  }
  return null;
}

export function parseVariantDimensions(label: string): {
  frameSize: FrameSize | null;
  wheelSizeInches: WheelSizeInches | null;
} {
  const parts = label.split("/").map((part) => part.trim());
  const sizePart = parts.length > 1 ? parts[parts.length - 1]! : label;
  return {
    frameSize: parseFrameSize(sizePart) ?? parseFrameSize(label),
    wheelSizeInches: parseWheelSize(sizePart) ?? parseWheelSize(label),
  };
}

function variantLabel(variant: ShopifyVariantRecord): string {
  return variant.public_title?.trim() || variant.name?.trim() || "";
}

export function matchShopifyVariant(
  variants: ShopifyVariantRecord[],
  preference: VariantPreference
): ShopifyVariantRecord | null {
  const matches = variants.filter((variant) => {
    const label = variantLabel(variant);
    if (!label) return false;
    const dimensions = parseVariantDimensions(label);
    return (
      dimensions.frameSize === preference.frameSize &&
      dimensions.wheelSizeInches === preference.wheelSizeInches
    );
  });

  return matches.length === 1 ? matches[0]! : null;
}

export function anyVariantAvailable(variants: ShopifyVariantRecord[]): boolean {
  const withAvailability = variants.filter((variant) => variant.available !== undefined);
  if (withAvailability.length > 0) {
    return withAvailability.some((variant) => variant.available === true);
  }
  return true;
}
