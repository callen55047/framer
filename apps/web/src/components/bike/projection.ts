import {
  DEFAULT_VIEWBOX,
  getGeometryBounds,
  projectToViewBox,
  resolveFramePoints,
  type FramePoints,
  type Point2D,
  type ViewBoxConfig,
  REFERENCE_TRAIL_BIKE,
} from "@framer/schema/browser";

export function useProjectedFrame(travelMm: number): {
  pts: FramePoints;
  project: (p: Point2D) => Point2D;
  viewBox: string;
  viewBoxConfig: ViewBoxConfig;
} {
  const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, travelMm);
  const bounds = getGeometryBounds(REFERENCE_TRAIL_BIKE);
  const project = (p: Point2D) => projectToViewBox(p, bounds, DEFAULT_VIEWBOX);
  return {
    pts,
    project,
    viewBox: `0 0 ${DEFAULT_VIEWBOX.width} ${DEFAULT_VIEWBOX.height}`,
    viewBoxConfig: DEFAULT_VIEWBOX,
  };
}

/** Shared props every annotation overlay receives. */
export interface AnnotationProps {
  pts: FramePoints;
  project: (p: Point2D) => Point2D;
  viewBox: ViewBoxConfig;
  travelMm: number;
}

export const FRAME_STROKE = "#a3a3a3";
export const FRAME_FILL = "#262626";
export const ANNOTATION_STROKE = "#60a5fa";
export const ANNOTATION_FILL = "#93c5fd";
export const GHOST_STROKE = "#3f3f46";
export const GROUND_STROKE = "#404040";
export const PIVOT_FILL = "#525252";
export const PIVOT_STROKE = "#d4d4d4";
export const HUB_FILL = "#737373";
export const RIM_STROKE = "#8a8a8a";
export const TYRE_STROKE = "#525252";
export const SHOCK_STROKE = "#737373";
export const SHOCK_BODY_FILL = "#404040";
export const ROCKER_FILL = "#3f3f46";
