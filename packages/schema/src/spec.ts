import { z } from "zod";

/**
 * A Product's Spec bag: structured, typed attributes sourced from manufacturer
 * pages, never from marketing copy or inference. Kept as a small closed set of
 * known keys rather than an open record, so Compatibility Rules can be written
 * against fields that are guaranteed to mean the same thing everywhere.
 *
 * All fields optional: most Products will only have a few Specs populated,
 * since ExtractSpecs jobs fill this in incrementally as pages are processed.
 */
export const SpecSchema = z
  .object({
    steererStandard: z.string().optional(), // e.g. "tapered 1.5-1.125in"
    steererDiameterMm: z.number().positive().optional(),
    barClampDiameterMm: z.number().positive().optional(),
    seatpostDiameterMm: z.number().positive().optional(),
    bottomBracketStandard: z.string().optional(), // e.g. "BSA 73mm"
    axleStandard: z.string().optional(), // e.g. "15x110mm Boost"
    brakeMount: z.string().optional(), // e.g. "post mount 180mm"
    maxForkTravelMm: z.number().positive().optional(),
    headTubeAngleDeg: z.number().optional(),
    seatTubeAngleDeg: z.number().optional(),
    reachMm: z.number().positive().optional(),
    stackMm: z.number().positive().optional(),
    chainstayMm: z.number().positive().optional(),
    bbDropMm: z.number().optional(),
    wheelbaseMm: z.number().positive().optional(),
    wheelSizeInches: z.number().positive().optional(), // e.g. 29
  })
  .partial();

export type Spec = z.infer<typeof SpecSchema>;

/** Slot names the assistant uses when searching for compatible parts. */
export const BuildSlotSchema = z.enum([
  "frame",
  "fork",
  "wheelset",
  "drivetrain",
  "brakes",
  "cockpit",
  "tires",
]);
export type BuildSlot = z.infer<typeof BuildSlotSchema>;

export const BUILD_SLOT_TO_CATEGORY: Record<BuildSlot, string> = {
  frame: "frame",
  fork: "fork",
  wheelset: "wheelset",
  drivetrain: "drivetrain",
  brakes: "brakes",
  cockpit: "cockpit",
  tires: "tires",
};
