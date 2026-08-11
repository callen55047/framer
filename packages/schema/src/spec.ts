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

export const SPEC_FIELD_LABELS: Record<keyof Spec, string> = {
  steererStandard: "Steerer standard",
  axleStandard: "Axle standard",
  brakeMount: "Brake mount",
  maxForkTravelMm: "Max fork travel (mm)",
  headTubeAngleDeg: "Head tube angle (deg)",
  seatTubeAngleDeg: "Seat tube angle (deg)",
  reachMm: "Reach (mm)",
  stackMm: "Stack (mm)",
  chainstayMm: "Chainstay (mm)",
  bbDropMm: "BB drop (mm)",
  wheelbaseMm: "Wheelbase (mm)",
  wheelSizeInches: "Wheel size (in)",
};
