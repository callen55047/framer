import {
  DEFAULT_VIEWBOX,
  getGeometryBounds,
  projectToViewBox,
  resolveFramePoints,
  type FramePoints,
  type Point2D,
  REFERENCE_TRAIL_BIKE,
} from "@framer/schema/browser";

export function useProjectedFrame(travelMm: number): {
  pts: FramePoints;
  project: (p: Point2D) => Point2D;
  viewBox: string;
} {
  const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, travelMm);
  const bounds = getGeometryBounds(REFERENCE_TRAIL_BIKE);
  const project = (p: Point2D) => projectToViewBox(p, bounds, DEFAULT_VIEWBOX);
  return {
    pts,
    project,
    viewBox: `0 0 ${DEFAULT_VIEWBOX.width} ${DEFAULT_VIEWBOX.height}`,
  };
}

export const FRAME_STROKE = "#a3a3a3";
export const ANNOTATION_STROKE = "#60a5fa";
export const ANNOTATION_FILL = "#93c5fd";
export const GROUND_STROKE = "#404040";
export const PIVOT_FILL = "#525252";
export const HUB_FILL = "#737373";
export const SHOCK_STROKE = "#737373";
