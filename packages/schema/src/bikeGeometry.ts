/**
 * Parametric bike geometry and Horst-link rear suspension kinematics.
 * Modelled after the Rocky Mountain Altitude 2021 (29", size M, Ride-9 neutral).
 * Browser-safe — no Node imports.
 *
 * Coordinate convention: +x forward, +y down (SVG-native). The datum is the
 * topped-out (zero travel) rear-and-front axle line at y = 0. `bb.y` is
 * therefore the BB drop below that line, and `groundY` is the wheel radius
 * below it. Travel = 0 means fully extended ("top-out"); a real shock's
 * quoted eye-to-eye length is measured at top-out, not at sag.
 */

export interface Point2D {
  x: number;
  y: number;
}

/** Frame geometry in millimeters (side view, +x forward, +y down). */
export interface FrameGeometryMm {
  wheelbaseMm: number;
  /** Centre-to-centre chainstay length (BB to rear axle), not the horizontal projection. */
  chainstayMm: number;
  reachMm: number;
  stackMm: number;
  headTubeAngleDeg: number;
  /** Effective seat tube angle (BB to a virtual point at saddle height). */
  seatTubeAngleDeg: number;
  bbDropMm: number;
  wheelRadiusMm: number;
  headTubeLengthMm: number;
  seatTubeLengthMm: number;
  /**
   * Distance from the BB, measured along the down tube, to where the actual
   * (kinked) seat tube begins. A straight tube from the BB at the effective
   * seat tube angle would pass inside the rear tyre at full travel on most
   * bikes; real frames route the seat tube forward of the BB to clear it.
   */
  seatTubeBaseAlongDownTubeMm: number;
}

/**
 * Horst-link rear suspension: the chainstay pivots on the front triangle
 * (main pivot), the seatstay pivots on the chainstay ahead of the rear axle
 * (Horst pivot) rather than concentric with it, and a rocker link connects
 * the seatstay to a shock mounted low in the front triangle.
 */
export interface HorstLinkLinkageMm {
  /** Main pivot position relative to the BB. +x forward, +y down (negative = above). */
  mainPivotOffsetFromBbMm: Point2D;
  /** Horst (chainstay/seatstay) pivot position relative to the topped-out rear axle. */
  horstPivotOffsetFromAxleMm: Point2D;
  /** Rocker-to-frame pivot, measured along the actual (kinked) seat tube from its base. */
  rockerFramePivotAlongSeatTubeMm: number;
  /** Rocker arm from frame pivot to seatstay pivot (mm). */
  rockerSeatstayArmMm: number;
  /**
   * Direction (degrees, standard math convention: x = cos, y = sin, in this
   * +y-down space) of the seatstay arm at top-out. Fixes the rocker's
   * rotational phase; the seatstay length itself is derived from this.
   */
  rockerSeatstayArmAngleAtTopOutDeg: number;
  /** Rocker arm from frame pivot to shock eye (mm). */
  rockerShockArmMm: number;
  /** Fixed angle (degrees) between the seatstay arm and the shock arm. */
  rockerIncludedAngleDeg: number;
  /** Shock lower mount, measured along the down tube from the BB (e.g. a Ride-9-style chip position). */
  shockLowerAlongDownTubeMm: number;
  /** Nominal shock eye-to-eye at top-out and stroke (mm) — for labels/tests; not used by the solver. */
  shockEyeToEyeMm: number;
  shockStrokeMm: number;
  /** Total rear-wheel travel (mm). */
  travelMm: number;
}

export interface BikeGeometryConfig {
  frame: FrameGeometryMm;
  linkage: HorstLinkLinkageMm;
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
  horstPivot: Point2D;
  rockerFramePivot: Point2D;
  rockerSeatstayPivot: Point2D;
  rockerShockPivot: Point2D;
  shockLower: Point2D;
  shockEyeToEyeMm: number;
  /** Intersection of the chainstay-link line and the rocker line; null if parallel. */
  instantCentre: Point2D | null;
  seatstayLengthMm: number;
}

export interface FramePoints {
  bb: Point2D;
  rearAxle: Point2D;
  frontAxle: Point2D;
  headTubeTop: Point2D;
  headTubeBottom: Point2D;
  seatTubeTop: Point2D;
  /** Where the actual (kinked) seat tube meets the down tube, ahead of the BB. */
  seatTubeBase: Point2D;
  topTubeEnd: Point2D;
  downTubeEnd: Point2D;
  /** Steering axis extended down to the axle datum line (y = 0). */
  forkAxisFoot: Point2D;
  /** Fork offset implied by wheelbase/reach/HTA — a self-consistency check, not an input. */
  derivedForkOffsetMm: number;
  groundY: number;
  bbHeightMm: number;
  wheelRadiusMm: number;
  rearEnd: RearEndSolution;
}

export interface LeveragePoint {
  travelMm: number;
  leverageRatio: number;
  shockEyeToEyeMm: number;
}

/** Reference trail bike: Rocky Mountain Altitude 2021, 29", size M, Ride-9 neutral. */
export const REFERENCE_TRAIL_BIKE: BikeGeometryConfig = {
  frame: {
    wheelbaseMm: 1218,
    chainstayMm: 438,
    reachMm: 449,
    stackMm: 624,
    headTubeAngleDeg: 64.4,
    seatTubeAngleDeg: 75.4,
    bbDropMm: 34,
    wheelRadiusMm: 370,
    headTubeLengthMm: 95,
    seatTubeLengthMm: 420,
    seatTubeBaseAlongDownTubeMm: 100,
  },
  linkage: {
    mainPivotOffsetFromBbMm: { x: 18, y: -65 },
    horstPivotOffsetFromAxleMm: { x: 60, y: 10 },
    rockerFramePivotAlongSeatTubeMm: 170,
    rockerSeatstayArmMm: 110,
    rockerSeatstayArmAngleAtTopOutDeg: 220,
    rockerShockArmMm: 80,
    rockerIncludedAngleDeg: 40,
    shockLowerAlongDownTubeMm: 262,
    shockEyeToEyeMm: 230,
    shockStrokeMm: 60,
    travelMm: 160,
  },
};

/** Fraction of total travel used at sag (typical trail-bike setup). */
export const SAG_FRACTION = 0.3;

export function sagTravelMm(config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE): number {
  return config.linkage.travelMm * SAG_FRACTION;
}

export const DEFAULT_VIEWBOX: ViewBoxConfig = {
  width: 800,
  height: 400,
  marginX: 40,
  marginY: 24,
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

export function distance(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function rotateVector(v: Point2D, angleRad: number): Point2D {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function cross(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
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

/** Intersection of infinite lines p1–p2 and p3–p4; null if parallel. */
function lineIntersection(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): Point2D | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

interface StaticFrame {
  bb: Point2D;
  rearAxleTopOut: Point2D;
  frontAxle: Point2D;
  headTubeTop: Point2D;
  headTubeBottom: Point2D;
  downTubeUnit: Point2D;
  forkAxisFoot: Point2D;
  derivedForkOffsetMm: number;
  seatTubeTop: Point2D;
  seatTubeBase: Point2D;
}

/** Frame points that never depend on rear-suspension travel. */
function resolveStaticFrame(config: BikeGeometryConfig): StaticFrame {
  const { frame } = config;
  const bb: Point2D = { x: 0, y: frame.bbDropMm };
  const rearAxleTopOut: Point2D = {
    x: -Math.sqrt(frame.chainstayMm * frame.chainstayMm - frame.bbDropMm * frame.bbDropMm),
    y: 0,
  };
  const frontAxle: Point2D = { x: rearAxleTopOut.x + frame.wheelbaseMm, y: 0 };

  const headTubeTop: Point2D = { x: frame.reachMm, y: frame.bbDropMm - frame.stackMm };
  const htaRad = degToRad(frame.headTubeAngleDeg);
  const headTubeBottom: Point2D = {
    x: headTubeTop.x + frame.headTubeLengthMm * Math.cos(htaRad),
    y: headTubeTop.y + frame.headTubeLengthMm * Math.sin(htaRad),
  };

  const downTubeLenMm = distance(bb, headTubeBottom);
  const downTubeUnit: Point2D = {
    x: (headTubeBottom.x - bb.x) / downTubeLenMm,
    y: (headTubeBottom.y - bb.y) / downTubeLenMm,
  };

  // Extend the steering axis (through headTubeTop/headTubeBottom) down to the axle datum line.
  const dirX = headTubeBottom.x - headTubeTop.x;
  const dirY = headTubeBottom.y - headTubeTop.y;
  const tToAxleLine = (0 - headTubeTop.y) / dirY;
  const forkAxisFoot: Point2D = { x: headTubeTop.x + dirX * tToAxleLine, y: 0 };
  const derivedForkOffsetMm = (frontAxle.x - forkAxisFoot.x) * Math.sin(htaRad);

  const staRad = degToRad(frame.seatTubeAngleDeg);
  const seatTubeTop: Point2D = {
    x: bb.x - frame.seatTubeLengthMm * Math.cos(staRad),
    y: bb.y - frame.seatTubeLengthMm * Math.sin(staRad),
  };
  const seatTubeBase: Point2D = {
    x: bb.x + frame.seatTubeBaseAlongDownTubeMm * downTubeUnit.x,
    y: bb.y + frame.seatTubeBaseAlongDownTubeMm * downTubeUnit.y,
  };

  return {
    bb,
    rearAxleTopOut,
    frontAxle,
    headTubeTop,
    headTubeBottom,
    downTubeUnit,
    forkAxisFoot,
    derivedForkOffsetMm,
    seatTubeTop,
    seatTubeBase,
  };
}

interface LinkageGeometry {
  mainPivot: Point2D;
  horstTopOut: Point2D;
  chainstayLinkLengthMm: number;
  rockerFramePivot: Point2D;
  rockerSeatstayPivotTopOut: Point2D;
  seatstayLengthMm: number;
  /** Rear axle position relative to the Horst pivot, in the seatstay-arm's local frame. */
  axleLocalOffset: Point2D;
  alphaTopOut: number;
  shockLower: Point2D;
  rearAxleTopOut: Point2D;
}

/** Fixed linkage geometry derived once from config; independent of travel. */
function buildLinkageGeometry(config: BikeGeometryConfig): LinkageGeometry {
  const { linkage } = config;
  const staticFrame = resolveStaticFrame(config);
  const { bb, rearAxleTopOut, seatTubeTop, seatTubeBase, downTubeUnit } = staticFrame;

  const mainPivot: Point2D = {
    x: bb.x + linkage.mainPivotOffsetFromBbMm.x,
    y: bb.y + linkage.mainPivotOffsetFromBbMm.y,
  };
  const horstTopOut: Point2D = {
    x: rearAxleTopOut.x + linkage.horstPivotOffsetFromAxleMm.x,
    y: rearAxleTopOut.y + linkage.horstPivotOffsetFromAxleMm.y,
  };
  const chainstayLinkLengthMm = distance(mainPivot, horstTopOut);

  const seatTubeLenMm = distance(seatTubeBase, seatTubeTop);
  const seatTubeUnit: Point2D = {
    x: (seatTubeTop.x - seatTubeBase.x) / seatTubeLenMm,
    y: (seatTubeTop.y - seatTubeBase.y) / seatTubeLenMm,
  };
  const rockerFramePivot: Point2D = {
    x: seatTubeBase.x + linkage.rockerFramePivotAlongSeatTubeMm * seatTubeUnit.x,
    y: seatTubeBase.y + linkage.rockerFramePivotAlongSeatTubeMm * seatTubeUnit.y,
  };

  const armAngleRad = degToRad(linkage.rockerSeatstayArmAngleAtTopOutDeg);
  const rockerSeatstayPivotTopOut: Point2D = {
    x: rockerFramePivot.x + linkage.rockerSeatstayArmMm * Math.cos(armAngleRad),
    y: rockerFramePivot.y + linkage.rockerSeatstayArmMm * Math.sin(armAngleRad),
  };

  const seatstayLengthMm = distance(horstTopOut, rockerSeatstayPivotTopOut);

  const refAngleTopOut = Math.atan2(
    rockerSeatstayPivotTopOut.y - horstTopOut.y,
    rockerSeatstayPivotTopOut.x - horstTopOut.x
  );
  const axleRelTopOut: Point2D = {
    x: rearAxleTopOut.x - horstTopOut.x,
    y: rearAxleTopOut.y - horstTopOut.y,
  };
  const axleLocalOffset = rotateVector(axleRelTopOut, -refAngleTopOut);

  const alphaTopOut = Math.atan2(horstTopOut.y - mainPivot.y, horstTopOut.x - mainPivot.x);

  const shockLower: Point2D = {
    x: bb.x + linkage.shockLowerAlongDownTubeMm * downTubeUnit.x,
    y: bb.y + linkage.shockLowerAlongDownTubeMm * downTubeUnit.y,
  };

  return {
    mainPivot,
    horstTopOut,
    chainstayLinkLengthMm,
    rockerFramePivot,
    rockerSeatstayPivotTopOut,
    seatstayLengthMm,
    axleLocalOffset,
    alphaTopOut,
    shockLower,
    rearAxleTopOut,
  };
}

interface RearEndPose {
  horstPivot: Point2D;
  rockerSeatstayPivot: Point2D;
  rearAxle: Point2D;
  rockerShockPivot: Point2D;
}

/**
 * Solve the rear-end pose for a given chainstay-link angle. The chainstay
 * link (mainPivot → horstPivot) rotates rigidly; the seatstay/dropout body
 * (horstPivot, rockerSeatstayPivot, rearAxle) and the rocker
 * (rockerFramePivot, rockerSeatstayPivot, rockerShockPivot) are each rigid.
 * Returns null if the linkage cannot geometrically close at this angle.
 */
function poseAtChainstayAngle(
  config: BikeGeometryConfig,
  geo: LinkageGeometry,
  alpha: number
): RearEndPose | null {
  const { linkage } = config;
  const horstPivot: Point2D = {
    x: geo.mainPivot.x + geo.chainstayLinkLengthMm * Math.cos(alpha),
    y: geo.mainPivot.y + geo.chainstayLinkLengthMm * Math.sin(alpha),
  };

  const candidates = circleCircleIntersection(
    horstPivot,
    geo.seatstayLengthMm,
    geo.rockerFramePivot,
    linkage.rockerSeatstayArmMm
  );
  if (!candidates) return null;

  const topOutSide = Math.sign(cross(horstPivot, geo.rockerFramePivot, geo.rockerSeatstayPivotTopOut));
  const side0 = Math.sign(cross(horstPivot, geo.rockerFramePivot, candidates[0]));
  const side1 = Math.sign(cross(horstPivot, geo.rockerFramePivot, candidates[1]));

  let rockerSeatstayPivot: Point2D;
  if (side0 === topOutSide) {
    rockerSeatstayPivot = candidates[0];
  } else if (side1 === topOutSide) {
    rockerSeatstayPivot = candidates[1];
  } else {
    rockerSeatstayPivot =
      distance(candidates[0], geo.rockerSeatstayPivotTopOut) <=
      distance(candidates[1], geo.rockerSeatstayPivotTopOut)
        ? candidates[0]
        : candidates[1];
  }

  const refAngle = Math.atan2(rockerSeatstayPivot.y - horstPivot.y, rockerSeatstayPivot.x - horstPivot.x);
  const axleOffset = rotateVector(geo.axleLocalOffset, refAngle);
  const rearAxle: Point2D = { x: horstPivot.x + axleOffset.x, y: horstPivot.y + axleOffset.y };

  const rockerAngle = Math.atan2(
    rockerSeatstayPivot.y - geo.rockerFramePivot.y,
    rockerSeatstayPivot.x - geo.rockerFramePivot.x
  );
  const shockAngle = rockerAngle + degToRad(linkage.rockerIncludedAngleDeg);
  const rockerShockPivot: Point2D = {
    x: geo.rockerFramePivot.x + linkage.rockerShockArmMm * Math.cos(shockAngle),
    y: geo.rockerFramePivot.y + linkage.rockerShockArmMm * Math.sin(shockAngle),
  };

  return { horstPivot, rockerSeatstayPivot, rearAxle, rockerShockPivot };
}

function buildSolution(geo: LinkageGeometry, pose: RearEndPose, actualTravelMm: number): RearEndSolution {
  const instantCentre = lineIntersection(
    geo.mainPivot,
    pose.horstPivot,
    geo.rockerFramePivot,
    pose.rockerSeatstayPivot
  );
  return {
    travelMm: actualTravelMm,
    rearAxle: pose.rearAxle,
    mainPivot: geo.mainPivot,
    horstPivot: pose.horstPivot,
    rockerFramePivot: geo.rockerFramePivot,
    rockerSeatstayPivot: pose.rockerSeatstayPivot,
    rockerShockPivot: pose.rockerShockPivot,
    shockLower: geo.shockLower,
    shockEyeToEyeMm: distance(pose.rockerShockPivot, geo.shockLower),
    instantCentre,
    seatstayLengthMm: geo.seatstayLengthMm,
  };
}

/**
 * Solve rear suspension at a given travel position by bisecting the
 * chainstay-link angle until the rear axle has risen by `travelMm`.
 * Throws if the linkage cannot geometrically reach the requested travel.
 */
export function solveRearEnd(config: BikeGeometryConfig, travelMm: number): RearEndSolution {
  const geo = buildLinkageGeometry(config);
  const target = Math.max(0, travelMm);

  if (target === 0) {
    const pose = poseAtChainstayAngle(config, geo, geo.alphaTopOut);
    if (!pose) {
      throw new RangeError("bikeGeometry: rear suspension linkage does not close at top-out");
    }
    return buildSolution(geo, pose, 0);
  }

  function travelAt(alpha: number): number | null {
    const pose = poseAtChainstayAngle(config, geo, alpha);
    return pose ? geo.rearAxleTopOut.y - pose.rearAxle.y : null;
  }

  let lo = geo.alphaTopOut;
  let hi = geo.alphaTopOut + 1.2;
  let tHi = travelAt(hi);
  let shrinkAttempts = 0;
  while (tHi === null && shrinkAttempts < 30) {
    hi = geo.alphaTopOut + (hi - geo.alphaTopOut) * 0.8;
    tHi = travelAt(hi);
    shrinkAttempts++;
  }
  if (tHi === null || tHi < target) {
    throw new RangeError(
      `bikeGeometry: rear suspension has no solution for ${travelMm}mm of travel ` +
        `(max reachable ≈ ${tHi === null ? 0 : tHi.toFixed(1)}mm)`
    );
  }

  let mid = lo;
  let tMid = 0;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    const t = travelAt(mid);
    if (t === null) {
      hi = mid;
      continue;
    }
    tMid = t;
    if (t < target) lo = mid;
    else hi = mid;
  }

  const pose = poseAtChainstayAngle(config, geo, mid);
  if (!pose) {
    throw new RangeError(`bikeGeometry: rear suspension has no solution for ${travelMm}mm of travel`);
  }
  return buildSolution(geo, pose, tMid);
}

export function resolveFramePoints(
  config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE,
  travelMm = 0
): FramePoints {
  const { frame } = config;
  const staticFrame = resolveStaticFrame(config);
  const rearEnd = solveRearEnd(config, travelMm);

  return {
    bb: staticFrame.bb,
    rearAxle: rearEnd.rearAxle,
    frontAxle: staticFrame.frontAxle,
    headTubeTop: staticFrame.headTubeTop,
    headTubeBottom: staticFrame.headTubeBottom,
    seatTubeTop: staticFrame.seatTubeTop,
    seatTubeBase: staticFrame.seatTubeBase,
    topTubeEnd: staticFrame.headTubeTop,
    downTubeEnd: staticFrame.headTubeBottom,
    forkAxisFoot: staticFrame.forkAxisFoot,
    derivedForkOffsetMm: staticFrame.derivedForkOffsetMm,
    groundY: frame.wheelRadiusMm,
    bbHeightMm: frame.wheelRadiusMm - frame.bbDropMm,
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

/** Bounds that fit the frame at every travel position, including the rocker's swing and the ground line. */
export function getGeometryBounds(config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const topOut = resolveFramePoints(config, 0);
  const fullTravel = resolveFramePoints(config, config.linkage.travelMm);
  const r = config.frame.wheelRadiusMm;
  const padding = 20;

  const xs = [
    topOut.rearAxle.x - r,
    fullTravel.rearAxle.x - r,
    topOut.frontAxle.x + r,
    topOut.headTubeTop.x,
    topOut.seatTubeTop.x,
  ];
  const ys = [
    topOut.groundY,
    topOut.bb.y + r,
    topOut.headTubeTop.y,
    topOut.seatTubeTop.y,
    fullTravel.rearEnd.rockerShockPivot.y,
    fullTravel.rearEnd.rockerSeatstayPivot.y,
    topOut.rearEnd.rockerShockPivot.y,
    topOut.rearEnd.rockerSeatstayPivot.y,
  ];

  return {
    minX: Math.min(...xs) - padding,
    maxX: Math.max(...xs) + padding,
    minY: Math.min(...ys) - padding,
    maxY: Math.max(...ys) + padding,
  };
}

export function sampleAxlePath(config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE, steps = 20): Point2D[] {
  const { linkage } = config;
  const path: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    const travel = (i / steps) * linkage.travelMm;
    path.push(solveRearEnd(config, travel).rearAxle);
  }
  return path;
}

export function leverageRatioCurve(
  config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE,
  steps = 32
): LeveragePoint[] {
  const { linkage } = config;
  const samples: { travelMm: number; shockEyeToEyeMm: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const travel = (i / steps) * linkage.travelMm;
    const rearEnd = solveRearEnd(config, travel);
    samples.push({ travelMm: rearEnd.travelMm, shockEyeToEyeMm: rearEnd.shockEyeToEyeMm });
  }

  const curve: LeveragePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const current = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(steps, i + 1)];
    if (!current || !prev || !next) continue;
    const dTravel = next.travelMm - prev.travelMm;
    const dShock = prev.shockEyeToEyeMm - next.shockEyeToEyeMm;
    const leverageRatio = dShock > 1e-6 ? dTravel / dShock : curve[curve.length - 1]?.leverageRatio ?? 0;
    curve.push({ travelMm: current.travelMm, leverageRatio, shockEyeToEyeMm: current.shockEyeToEyeMm });
  }

  return curve;
}

const CHAIN_PITCH_MM = 12.7;

function sprocketRadiusMm(teeth: number): number {
  return (teeth * CHAIN_PITCH_MM) / (2 * Math.PI);
}

/** Chain tangent points on the upper (pulling) side of the chainring and cog. */
export function chainLine(
  bb: Point2D,
  rearAxle: Point2D,
  chainringTeeth: number,
  cogTeeth: number
): { ringPoint: Point2D; cogPoint: Point2D } {
  const ringR = sprocketRadiusMm(chainringTeeth);
  const cogR = sprocketRadiusMm(cogTeeth);
  const dx = rearAxle.x - bb.x;
  const dy = rearAxle.y - bb.y;
  const len = Math.hypot(dx, dy);
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return {
    ringPoint: { x: bb.x + nx * ringR, y: bb.y + ny * ringR },
    cogPoint: { x: rearAxle.x + nx * cogR, y: rearAxle.y + ny * cogR },
  };
}

export interface AntiSquatOptions {
  chainringTeeth?: number;
  cogTeeth?: number;
  cogHeightMm?: number;
}

export interface AntiSquatConstruction {
  instantCentre: Point2D;
  ringPoint: Point2D;
  cogPoint: Point2D;
  /** Intersection of the chain line and the rear-axle-to-instant-centre line. */
  instantForceCentre: Point2D;
  contactPatch: Point2D;
  frontAxleVertical: Point2D;
  percent: number;
}

/** Graphical anti-squat construction: chain line ∩ (rear axle → instant centre), extended to the front axle. */
export function antiSquatConstruction(
  config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE,
  travelMm = 0,
  options: AntiSquatOptions = {}
): AntiSquatConstruction | null {
  const { chainringTeeth = 32, cogTeeth = 32, cogHeightMm = 1150 } = options;
  const pts = resolveFramePoints(config, travelMm);
  const ic = pts.rearEnd.instantCentre;
  if (!ic) return null;

  const { ringPoint, cogPoint } = chainLine(pts.bb, pts.rearAxle, chainringTeeth, cogTeeth);
  const instantForceCentre = lineIntersection(ringPoint, cogPoint, pts.rearAxle, ic);
  if (!instantForceCentre) return null;

  const contactPatch: Point2D = { x: pts.rearAxle.x, y: pts.groundY };
  const dirX = instantForceCentre.x - contactPatch.x;
  const dirY = instantForceCentre.y - contactPatch.y;
  if (Math.abs(dirX) < 1e-6) return null;
  const t = (pts.frontAxle.x - contactPatch.x) / dirX;
  const heightAtFrontAxleY = contactPatch.y + t * dirY;
  const heightAboveGroundMm = pts.groundY - heightAtFrontAxleY;
  const percent = (heightAboveGroundMm / cogHeightMm) * 100;

  return {
    instantCentre: ic,
    ringPoint,
    cogPoint,
    instantForceCentre,
    contactPatch,
    frontAxleVertical: { x: pts.frontAxle.x, y: heightAtFrontAxleY },
    percent,
  };
}

export function antiSquatPercent(
  config: BikeGeometryConfig = REFERENCE_TRAIL_BIKE,
  travelMm = 0,
  options?: AntiSquatOptions
): number | null {
  return antiSquatConstruction(config, travelMm, options)?.percent ?? null;
}

export function instantCentre(solution: RearEndSolution): Point2D | null {
  return solution.instantCentre;
}
