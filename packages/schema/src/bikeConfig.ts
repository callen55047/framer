import { z } from "zod";

/** Canonical frame sizes used across the app and matched against retailer labels. */
export const FrameSizeSchema = z.enum(["XS", "S", "M", "L", "XL", "XXL"]);
export type FrameSize = z.infer<typeof FrameSizeSchema>;

/** Canonical wheel diameters in inches. */
export const WheelSizeInchesSchema = z.enum(["26", "27.5", "29"]);
export type WheelSizeInches = z.infer<typeof WheelSizeInchesSchema>;

export const FRAME_SIZE_OPTIONS: { value: FrameSize; label: string }[] = [
  { value: "XS", label: "XS" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
  { value: "XXL", label: "XXL" },
];

export const WHEEL_SIZE_OPTIONS: { value: WheelSizeInches; label: string }[] = [
  { value: "26", label: '26"' },
  { value: "27.5", label: '27.5"' },
  { value: "29", label: '29"' },
];

export const VariantPreferenceSchema = z.object({
  frameSize: FrameSizeSchema,
  wheelSizeInches: WheelSizeInchesSchema,
});
export type VariantPreference = z.infer<typeof VariantPreferenceSchema>;
