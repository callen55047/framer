import { FRAME_SIZE_OPTIONS, type FrameSize } from "@framer/schema/browser";
import type { ListingVariant } from "./api.js";

export interface VariantTableRow {
  variant: ListingVariant;
  frameSize: string | null;
  wheelSize: string | null;
  options: string | null;
  isCheapestInStock: boolean;
  isStale: boolean;
}

export type VariantTableColumn = "frameSize" | "wheelSize" | "options";

export interface VariantTable {
  columns: VariantTableColumn[];
  rows: VariantTableRow[];
}

const FRAME_SIZE_ALIAS: Record<string, FrameSize> = {
  XS: "XS",
  S: "S",
  SM: "S",
  SMALL: "S",
  M: "M",
  MD: "M",
  MEDIUM: "M",
  L: "L",
  LG: "L",
  LARGE: "L",
  XL: "XL",
  XXL: "XXL",
};

const FRAME_SIZE_ORDER = new Map(FRAME_SIZE_OPTIONS.map((option, index) => [option.value, index]));

const WHEEL_SIZE_PATTERN = /^(26|27\.5|29)$/;

function normalizeFrameSizeFromSegment(segment: string): FrameSize | null {
  const compact = segment.trim().toUpperCase().replace(/\s+/g, "");
  const direct = FRAME_SIZE_ALIAS[compact];
  if (direct) return direct;

  const wordMatch = segment.match(/\b(XS|XXL|XL|SM|MD|LG|S|M|L)\b/i);
  if (!wordMatch?.[1]) return null;
  return FRAME_SIZE_ALIAS[wordMatch[1].toUpperCase()] ?? null;
}

function normalizeWheelSizeFromSegment(segment: string): string | null {
  const trimmed = segment.trim();
  if (WHEEL_SIZE_PATTERN.test(trimmed)) return trimmed;

  const quoted = trimmed.match(/(26|27\.5|29)\s*"/);
  if (quoted) return quoted[1] ?? null;

  const bare = trimmed.match(/\b(26|27\.5|29)\b/);
  return bare?.[1] ?? null;
}

function segmentMatchesFrameSize(segment: string, frameSize: FrameSize): boolean {
  return normalizeFrameSizeFromSegment(segment) === frameSize;
}

function segmentMatchesWheelSize(segment: string, wheelSizeInches: string): boolean {
  return normalizeWheelSizeFromSegment(segment) === wheelSizeInches;
}

function deriveOptions(variant: ListingVariant): string | null {
  const { label, frameSize, wheelSizeInches } = variant;
  if (!frameSize && !wheelSizeInches) {
    return label;
  }

  const segments = label.split(/\s+\/\s+/);
  const residual = segments.filter((segment) => {
    if (frameSize && segmentMatchesFrameSize(segment, frameSize)) return false;
    if (wheelSizeInches && segmentMatchesWheelSize(segment, wheelSizeInches)) return false;
    return true;
  });

  const joined = residual.map((segment) => segment.trim()).filter(Boolean).join(" / ");
  return joined || null;
}

function formatWheelSize(wheelSizeInches: ListingVariant["wheelSizeInches"]): string | null {
  if (!wheelSizeInches) return null;
  return `${wheelSizeInches}"`;
}

function compareRows(a: VariantTableRow, b: VariantTableRow): number {
  const wheelA = a.variant.wheelSizeInches ? Number(a.variant.wheelSizeInches) : Number.POSITIVE_INFINITY;
  const wheelB = b.variant.wheelSizeInches ? Number(b.variant.wheelSizeInches) : Number.POSITIVE_INFINITY;
  if (wheelA !== wheelB) return wheelA - wheelB;

  const frameA = a.variant.frameSize ? (FRAME_SIZE_ORDER.get(a.variant.frameSize) ?? 999) : 999;
  const frameB = b.variant.frameSize ? (FRAME_SIZE_ORDER.get(b.variant.frameSize) ?? 999) : 999;
  if (frameA !== frameB) return frameA - frameB;

  return (a.options ?? "").localeCompare(b.options ?? "");
}

export function buildVariantTable(variants: ListingVariant[]): VariantTable {
  if (variants.length === 0) {
    return { columns: [], rows: [] };
  }

  const latestSeenAt = variants.reduce(
    (latest, variant) => (variant.lastSeenAt > latest ? variant.lastSeenAt : latest),
    variants[0]!.lastSeenAt
  );

  const baseRows = variants.map((variant) => ({
    variant,
    frameSize: variant.frameSize,
    wheelSize: formatWheelSize(variant.wheelSizeInches),
    options: deriveOptions(variant),
    isCheapestInStock: false,
    isStale: variant.lastSeenAt < latestSeenAt,
  }));

  const inStockPrices = baseRows.filter((row) => row.variant.inStock).map((row) => row.variant.price);
  const cheapestPrice = inStockPrices.length > 0 ? Math.min(...inStockPrices) : null;

  const rows = baseRows
    .map((row) => ({
      ...row,
      isCheapestInStock:
        cheapestPrice !== null && row.variant.inStock && row.variant.price === cheapestPrice,
    }))
    .sort(compareRows);

  const columns: VariantTableColumn[] = [];
  if (rows.some((row) => row.frameSize !== null)) columns.push("frameSize");
  if (rows.some((row) => row.wheelSize !== null)) columns.push("wheelSize");
  if (rows.some((row) => row.options !== null)) columns.push("options");

  return { columns, rows };
}
