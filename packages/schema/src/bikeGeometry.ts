/**
 * Parametric bike geometry and split-pivot suspension kinematics.
 * Browser-safe — no Node imports.
 */

export interface Point2D {
  x: number;
  y: number;
}

/** Frame geometry in millimeters (side view, +x right, +y down). */
export interface FrameGeometryMm {
  wheelbaseMm: number;
  chainstayMm: number;
  reachMm: number;
  stackMm: number;
  headTubeAngleDeg: number;
  seatTubeAngleDeg: number;
  bbDropMm: number;
  wheelRadiusMm: number;
  headTubeLengthMm: number;
  seatTubeLengthMm: number;
}

/** Split-pivot rear suspension linkage dimensions. */
export interface SplitPivotLinkageMm {
  /** Main pivot offset from BB along seat-tube direction (mm). */
  mainPivotOffsetFromBbMm: number;
  /** Rocker pivot on frame, offset from BB along seat tube (mm). */
  rockerFramePivotOffsetFromBbMm: number;
  /** Seatstay length (mm). */
  seatstayLengthMm: number;
  /** Rocker arm from frame pivot to seatstay pivot (mm). */
  rockerArmLengthMm: number;
  /** Rocker arm from frame pivot to shock eye (mm). */
  rockerShockArmLengthMm: number;
  /** Shock lower mount offset from BB along down-tube direction (mm). */
  shockLowerOffsetFromBbMm: number;
  /** Total rear suspension travel (mm). */
  travelMm: number;
}

export interface BikeGeometryConfig {
  frame: FrameGeometryMm;
  linkage: SplitPivotLinkageMm;
}

export interface ViewBoxConfig {
  width: number;
  height: number;
  marginX: number;
  marginY: number;
}

export interface RearEndSolution {
  travelMm: number;
  rearAxle: Point2D;
  mainPivot: Point2D;
  rockerFramePivot: Point2D;
  rockerSeatstayPivot: Point2D;
  rockerShockPivot: Point2D;
  shockLower: Point2D;
  shockEyeToEyeMm: number;
}

export interface FramePoints {
  bb: Point2D;
  rearAxle: Point2D;
  frontAxle: Point2D;
  headTubeTop: Point2D;
  headTubeBottom: Point2D;
  seatTubeTop: Point2D;
  topTubeEnd: Point2D;
  downTubeEnd: Point2D;
  groundY: number;
  wheelRadiusMm: number;
  rearEnd: RearEndSolution;
}

export interface LeveragePoint {
  travelMm: number;
  leverageRatio: number;
  shockEyeToEyeMm: number;
}

/** Reference trail bike geometry (medium 29er). */
export const REFERENCE_TRAIL_BIKE: BikeGeometryConfig = {
  frame: {
    wheelbaseMm: 1230,
    chainstayMm: 435,
    reachMm: 470,
    stackMm: 630,
    headTubeAngleDeg: 65,
    seatTubeAngleDeg: 77,
    bbDropMm: 35,
    wheelRadiusMm: 368,
    headTubeLengthMm: 110,
    seatTubeLengthMm: 480,
  },
  linkage: {
    mainPivotOffsetFromBbMm: 55,
    rockerFramePivotOffsetFromBbMm: 380,
    seatstayLengthMm: 430,
    rockerArmLengthMm: 55,
    rockerShockArmLengthMm: 45,
    shockLowerOffsetFromBbMm: 100,
    travelMm: 140,
  },
};

export const DEFAULT_VIEWBOX: ViewBoxConfig = {
  width: 400,
  height: 300,
  marginX: 40,
  marginY: 30,
};

export const KNOWN_DIAGRAM_IDS = [
  "reach",
  "stack",
  "chainstay",
  "bb-drop",
  "bb-height",
  "wheelbase",
  "wheel-size",
  "head-tube-angle",
  "seat-tube-angle",
  "suspension-travel",
  "anti-squat",
] as const;

export type DiagramId = (typeof KNOWN_DIAGRAM_IDS)[number];

const DEG = Math.PI / 180;

function degToRad(deg: number): number {
  return deg * DEG;
}

function pointAlongAngle(origin: Point2D, angleDeg: number, distanceMm: number): Point2D {
  const rad = degToRad(angleDeg);
  return {
    x: origin.x + distanceMm * Math.cos(rad),
    y: origin.y - distanceMm * Math.sin(rad),
  };
}

export function distance(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function circleCircleIntersection(
  c1: Point2D,
  r1: number,
  c2: Point2D,
  r2: number
): [Point2D, Point2D] | null {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return null;

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const px = c1.x + (a * dx) / d;
  const py = c1.y + (a * dy) / d;
  const perpX = (-dy * h) / d;
  const perpY = (dx * h) / d;

  return [
    { x: px + perpX, y: py + perpY },
    { x: px - perpX, y: py - perpY },
  ];
}

function pickNearestPoint(candidates: [Point2D, Point2D], reference: Point2D): Point2D {
  return distance(candidates[0], reference) <= distance(candidates[1], reference)
    ? candidates[0]
    : candidates[1];
}

function sagRearAxle(bb: Point2D, chainstayMm: number): Point2D {
  return { x: bb.x - chainstayMm, y: bb.y };
}

/**
 * Solve rear suspension at a given travel position.
 * Axle moves on a circular arc about the main pivot.
 */
export function solveRearEnd(
  config: BikeGeometryConfig,
  bb: Point2D,
  travelMm: number,
  previousRockerPivot?: Point2D
): RearEndSolution {
  const { frame, linkage } = config;

  const mainPivot = pointAlongAngle(bb, frame.seatTubeAngleDeg, linkage.mainPivotOffsetFromBbMm);
  const rockerFramePivot = pointAlongAngle(bb, frame.seatTubeAngleDeg, linkage.rockerFramePivotOffsetFromBbMm);
  const sagAxle = sagRearAxle(bb, frame.chainstayMm);

  const chainstayRadius = distance(mainPivot, sagAxle);
  const sagAngle = Math.atan2(sagAxle.y - mainPivot.y, sagAxle.x - mainPivot.x);

  let rearAxle: Point2D;
  if (travelMm <= 0) {
    rearAxle = sagAxle;
  } else {
    const targetY = sagAxle.y - travelMm;
    const dy = targetY - mainPivot.y;
    const cosAngleSq = 1 - (dy * dy) / (chainstayRadius * chainstayRadius);
    if (cosAngleSq < 0) {
      rearAxle = sagAxle;
    } else {
      const cosAngle = Math.sqrt(cosAngleSq);
      const angleA = Math.atan2(dy, cosAngle * chainstayRadius);
      const angleB = Math.atan2(dy, -cosAngle * chainstayRadius);
      const candidateA = {
        x: mainPivot.x + chainstayRadius * Math.cos(angleA),
        y: mainPivot.y + chainstayRadius * Math.sin(angleA),
      };
      const candidateB = {
        x: mainPivot.x + chainstayRadius * Math.cos(angleB),
        y: mainPivot.y + chainstayRadius * Math.sin(angleB),
      };
      rearAxle = distance(candidateA, sagAxle) <= distance(candidateB, sagAxle) ? candidateA : candidateB;
    }
  }

  const intersections = circleCircleIntersection(
    rearAxle,
    linkage.seatstayLengthMm,
    rockerFramePivot,
    linkage.rockerArmLengthMm
  );

  const fallbackRocker = pointAlongAngle(rockerFramePivot, frame.seatTubeAngleDeg - 25, linkage.rockerArmLengthMm);
  const rockerSeatstayPivot = intersections
    ? pickNearestPoint(intersections, previousRockerPivot ?? fallbackRocker)
    : fallbackRocker;

  const rockerVecAngle = Math.atan2(
    rockerSeatstayPivot.y - rockerFramePivot.y,
    rockerSeatstayPivot.x - rockerFramePivot.x
  );
  const rockerShockPivot = {
    x: rockerFramePivot.x + linkage.rockerShockArmLengthMm * Math.cos(rockerVecAngle - 1.1),
    y: rockerFramePivot.y + linkage.rockerShockArmLengthMm * Math.sin(rockerVecAngle - 1.1),
  };

  const htaRad = degToRad(frame.headTubeAngleDeg);
  const shockLower = {
    x: bb.x + linkage.shockLowerOffsetFromBbMm * Math.cos(htaRad + Math.PI) * 0.5,
    y: bb.y + linkage.shockLowerOffsetFromBbMm * Math.sin(htaRad) * 0.15,
  };

  const shockEyeToEyeMm = distance(rockerShockPivot, shockLower);

  return {
    travelMm,
    rearAxle,
    mainPivot,
    rockerFramePivot,
    rockerSeatstayPivot,
    rockerShockPivot,
    shockLower,
    shockEyeToEyeMm,
  };
}

export function resolveFramePoints(
  config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE,
  travelMm = 0
): FramePoints {
  const { frame } = config;
  const groundY = 0;
  const bbY = frame.wheelRadiusMm - frame.bbDropMm;
  const bb: Point2D = { x: 0, y: bbY };

  const rearEnd = solveRearEnd(config, bb, travelMm);
  const rearAxle = rearEnd.rearAxle;
  const frontAxle: Point2D = { x: rearAxle.x + frame.wheelbaseMm, y: bbY };

  const headTubeTop: Point2D = { x: bb.x + frame.reachMm, y: bb.y - frame.stackMm };
  const headTubeBottom = pointAlongAngle(headTubeTop, frame.headTubeAngleDeg + 180, frame.headTubeLengthMm);
  const seatTubeTop = pointAlongAngle(bb, frame.seatTubeAngleDeg, frame.seatTubeLengthMm);

  return {
    bb,
    rearAxle,
    frontAxle,
    headTubeTop,
    headTubeBottom,
    seatTubeTop,
    topTubeEnd: headTubeTop,
    downTubeEnd: headTubeBottom,
    groundY,
    wheelRadiusMm: frame.wheelRadiusMm,
    rearEnd,
  };
}

export function projectToViewBox(
  point: Point2D,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  viewBox: ViewBoxConfig = DEFAULT_VIEWBOX
): Point2D {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const scaleX = (viewBox.width - 2 * viewBox.marginX) / contentWidth;
  const scaleY = (viewBox.height - 2 * viewBox.marginY) / contentHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = viewBox.marginX + (viewBox.width - 2 * viewBox.marginX - contentWidth * scale) / 2;
  const offsetY = viewBox.marginY + (viewBox.height - 2 * viewBox.marginY - contentHeight * scale) / 2;

  return {
    x: offsetX + (point.x - bounds.minX) * scale,
    y: offsetY + (point.y - bounds.minY) * scale,
  };
}

export function getGeometryBounds(config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const pts = resolveFramePoints(config, 0);
  const r = config.frame.wheelRadiusMm;
  const padding = 20;

  const xs = [pts.rearAxle.x - r, pts.frontAxle.x + r, pts.headTubeTop.x, pts.seatTubeTop.x];
  const ys = [pts.groundY, pts.bb.y + r, pts.headTubeTop.y - padding, pts.seatTubeTop.y - padding];

  return {
    minX: Math.min(...xs) - padding,
    maxX: Math.max(...xs) + padding,
    minY: Math.min(...ys) - padding,
    maxY: Math.max(...ys) + padding,
  };
}

export function sampleAxlePath(
  config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE,
  steps = 20
): Point2D[] {
  const { linkage } = config;
  const pts = resolveFramePoints(config, 0);
  const path: Point2D[] = [];
  let prevRocker: Point2D | undefined;

  for (let i = 0; i <= steps; i++) {
    const travel = (i / steps) * linkage.travelMm;
    const rearEnd = solveRearEnd(config, pts.bb, travel, prevRocker);
    path.push(rearEnd.rearAxle);
    prevRocker = rearEnd.rockerSeatstayPivot;
  }

  return path;
}

export function leverageRatioCurve(
  config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE,
  steps = 20
): LeveragePoint[] {
  const { linkage } = config;
  const pts = resolveFramePoints(config, 0);
  const curve: LeveragePoint[] = [];
  let prevRocker: Point2D | undefined;
  let prevShock = 0;
  let prevTravel = 0;

  for (let i = 0; i <= steps; i++) {
    const travel = (i / steps) * linkage.travelMm;
    const rearEnd = solveRearEnd(config, pts.bb, travel, prevRocker);
    prevRocker = rearEnd.rockerSeatstayPivot;

    let leverageRatio = 2.5;
    if (i > 0) {
      const dTravel = travel - prevTravel;
      const dShock = prevShock - rearEnd.shockEyeToEyeMm;
      if (dShock > 0.01) {
        leverageRatio = dTravel / dShock;
      }
    }

    curve.push({ travelMm: travel, leverageRatio, shockEyeToEyeMm: rearEnd.shockEyeToEyeMm });
    prevShock = rearEnd.shockEyeToEyeMm;
    prevTravel = travel;
  }

  return curve;
}
