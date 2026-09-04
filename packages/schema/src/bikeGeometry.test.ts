import { describe, expect, it } from "vitest";
import {
  REFERENCE_TRAIL_BIKE,
  antiSquatPercent,
  distance,
  getGeometryBounds,
  leverageRatioCurve,
  projectToViewBox,
  resolveFramePoints,
  sagTravelMm,
  sampleAxlePath,
  solveRearEnd,
  DEFAULT_VIEWBOX,
  type BikeGeometryConfig,
  type Point2D,
} from "./bikeGeometry.js";

function pointSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq)) : 0;
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}

describe("bikeGeometry — frame", () => {
  it("head tube leans forward and down from top to bottom", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    expect(pts.headTubeBottom.x).toBeGreaterThan(pts.headTubeTop.x);
    expect(pts.headTubeBottom.y).toBeGreaterThan(pts.headTubeTop.y);
  });

  it("seat tube top sits behind the BB", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    expect(pts.seatTubeTop.x).toBeLessThan(pts.bb.x);
  });

  it("BB sits below the axle line by bbDrop, and ground sits a wheel radius below it", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    const { frame } = REFERENCE_TRAIL_BIKE;
    expect(pts.bb.y - pts.rearAxle.y).toBeCloseTo(frame.bbDropMm, 0);
    expect(pts.groundY - pts.rearAxle.y).toBeCloseTo(frame.wheelRadiusMm, 0);
    expect(pts.bbHeightMm).toBeCloseTo(frame.wheelRadiusMm - frame.bbDropMm, 0);
  });

  it("resolves realistic wheelbase, chainstay, reach and stack", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    const { frame } = REFERENCE_TRAIL_BIKE;
    expect(distance(pts.bb, pts.rearAxle)).toBeCloseTo(frame.chainstayMm, 0);
    expect(distance(pts.rearAxle, pts.frontAxle)).toBeCloseTo(frame.wheelbaseMm, 0);
    expect(pts.headTubeTop.x - pts.bb.x).toBeCloseTo(frame.reachMm, 0);
    expect(pts.bb.y - pts.headTubeTop.y).toBeCloseTo(frame.stackMm, 0);
  });

  it("front axle does not move as the rear suspension compresses", () => {
    const topOut = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    const full = resolveFramePoints(REFERENCE_TRAIL_BIKE, REFERENCE_TRAIL_BIKE.linkage.travelMm);
    expect(full.frontAxle.x).toBeCloseTo(topOut.frontAxle.x, 6);
    expect(full.frontAxle.y).toBeCloseTo(topOut.frontAxle.y, 6);
  });

  it("derives a plausible fork offset from wheelbase/reach/HTA", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    expect(pts.derivedForkOffsetMm).toBeGreaterThan(35);
    expect(pts.derivedForkOffsetMm).toBeLessThan(55);
  });

  it("the actual (kinked) seat tube clears the rear tyre through the whole travel range", () => {
    const { linkage, frame } = REFERENCE_TRAIL_BIKE;
    const topOut = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    let minClearance = Infinity;
    for (let i = 0; i <= 20; i++) {
      const travel = (i / 20) * linkage.travelMm;
      const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, travel);
      const clearance =
        pointSegmentDistance(pts.rearAxle, topOut.seatTubeBase, topOut.seatTubeTop) - frame.wheelRadiusMm;
      minClearance = Math.min(minClearance, clearance);
    }
    expect(minClearance).toBeGreaterThan(0);
  });

  it("a straight effective seat tube through the BB would NOT clear the tyre (motivates the kink)", () => {
    const { linkage, frame } = REFERENCE_TRAIL_BIKE;
    const topOut = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, linkage.travelMm);
    const clearance = pointSegmentDistance(pts.rearAxle, topOut.bb, topOut.seatTubeTop) - frame.wheelRadiusMm;
    expect(clearance).toBeLessThan(0);
  });
});

describe("bikeGeometry — Horst-link rear suspension", () => {
  it("solves at every sampled travel with no drift and no throw", () => {
    const { linkage } = REFERENCE_TRAIL_BIKE;
    for (let i = 0; i <= 32; i++) {
      const target = (i / 32) * linkage.travelMm;
      const solution = solveRearEnd(REFERENCE_TRAIL_BIKE, target);
      expect(Math.abs(solution.travelMm - target)).toBeLessThan(0.1);
    }
  });

  it("throws when the linkage cannot geometrically reach the requested travel", () => {
    const broken: BikeGeometryConfig = {
      ...REFERENCE_TRAIL_BIKE,
      linkage: { ...REFERENCE_TRAIL_BIKE.linkage, rockerSeatstayArmMm: 10 },
    };
    expect(() => solveRearEnd(broken, broken.linkage.travelMm)).toThrow(RangeError);
  });

  it("rocker pivot sweeps through the travel range with branch-continuous steps", () => {
    const { linkage } = REFERENCE_TRAIL_BIKE;
    const pivots: Point2D[] = [];
    for (let i = 0; i <= 20; i++) {
      const travel = (i / 20) * linkage.travelMm;
      pivots.push(solveRearEnd(REFERENCE_TRAIL_BIKE, travel).rockerSeatstayPivot);
    }
    let totalMovement = 0;
    for (let i = 1; i < pivots.length; i++) {
      const step = distance(pivots[i]!, pivots[i - 1]!);
      expect(step).toBeLessThan(15);
      totalMovement += step;
    }
    expect(totalMovement).toBeGreaterThan(80);
  });

  it("horst pivot moves and the instant centre is distinct from the main pivot (not a faux-bar arcing about it)", () => {
    const topOut = solveRearEnd(REFERENCE_TRAIL_BIKE, 0);
    const full = solveRearEnd(REFERENCE_TRAIL_BIKE, REFERENCE_TRAIL_BIKE.linkage.travelMm);
    expect(distance(topOut.horstPivot, full.horstPivot)).toBeGreaterThan(10);
    // If this were a single rigid body pivoting about mainPivot (split-pivot/faux-bar),
    // the instant centre would coincide with mainPivot at every travel position.
    for (const solution of [topOut, full]) {
      expect(solution.instantCentre).not.toBeNull();
      expect(distance(solution.instantCentre!, solution.mainPivot)).toBeGreaterThan(20);
    }
  });

  it("shock is at its nominal eye-to-eye at top-out and compresses by roughly the stroke", () => {
    const { linkage } = REFERENCE_TRAIL_BIKE;
    const topOut = solveRearEnd(REFERENCE_TRAIL_BIKE, 0);
    const full = solveRearEnd(REFERENCE_TRAIL_BIKE, linkage.travelMm);
    expect(topOut.shockEyeToEyeMm).toBeGreaterThan(linkage.shockEyeToEyeMm - 10);
    expect(topOut.shockEyeToEyeMm).toBeLessThan(linkage.shockEyeToEyeMm + 10);
    const stroke = topOut.shockEyeToEyeMm - full.shockEyeToEyeMm;
    expect(stroke).toBeGreaterThan(linkage.shockStrokeMm * 0.7);
    expect(stroke).toBeLessThan(linkage.shockStrokeMm * 1.3);
  });

  it("shock shortens monotonically through travel", () => {
    const { linkage } = REFERENCE_TRAIL_BIKE;
    let prevShock = Infinity;
    for (let i = 0; i <= 20; i++) {
      const travel = (i / 20) * linkage.travelMm;
      const solution = solveRearEnd(REFERENCE_TRAIL_BIKE, travel);
      if (i > 0) expect(solution.shockEyeToEyeMm).toBeLessThanOrEqual(prevShock + 0.01);
      prevShock = solution.shockEyeToEyeMm;
    }
  });

  it("rocker seatstay pivot stays outside the rear tyre through travel", () => {
    const { linkage, frame } = REFERENCE_TRAIL_BIKE;
    for (let i = 0; i <= 10; i++) {
      const travel = (i / 10) * linkage.travelMm;
      const solution = solveRearEnd(REFERENCE_TRAIL_BIKE, travel);
      expect(distance(solution.rockerSeatstayPivot, solution.rearAxle)).toBeGreaterThan(frame.wheelRadiusMm);
    }
  });

  it("front and rear wheels do not overlap", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    expect(pts.frontAxle.x - pts.rearAxle.x).toBeGreaterThan(2 * pts.wheelRadiusMm);
  });

  it("rear end solution includes all linkage points", () => {
    const solution = solveRearEnd(REFERENCE_TRAIL_BIKE, 0);
    expect(solution.mainPivot).toBeDefined();
    expect(solution.horstPivot).toBeDefined();
    expect(solution.rockerFramePivot).toBeDefined();
    expect(solution.rockerSeatstayPivot).toBeDefined();
    expect(solution.rockerShockPivot).toBeDefined();
    expect(solution.shockLower).toBeDefined();
    expect(solution.seatstayLengthMm).toBeGreaterThan(100);
  });
});

describe("bikeGeometry — axle path and leverage curve", () => {
  it("axle path moves rearward early in travel then forward by full travel", () => {
    const path = sampleAxlePath(REFERENCE_TRAIL_BIKE, 20);
    const topOutX = path[0]!.x;
    const earlyX = path[2]!.x;
    const fullX = path[path.length - 1]!.x;
    expect(earlyX).toBeLessThanOrEqual(topOutX + 0.5);
    expect(fullX).toBeGreaterThan(topOutX);
  });

  it("leverage ratio stays in a sane, progressive range", () => {
    const curve = leverageRatioCurve(REFERENCE_TRAIL_BIKE, 32);
    const ratios = curve.map((p) => p.leverageRatio);
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(1.9);
      expect(ratio).toBeLessThan(3.4);
    }
    expect(ratios[0]).toBeGreaterThan(ratios[ratios.length - 1]!);
    const progression = 1 - ratios[ratios.length - 1]! / ratios[0]!;
    expect(progression).toBeGreaterThan(0.1);
    expect(progression).toBeLessThan(0.4);
  });

  it("leverage ratio is non-increasing through travel (within numerical tolerance)", () => {
    const curve = leverageRatioCurve(REFERENCE_TRAIL_BIKE, 32);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.leverageRatio).toBeLessThanOrEqual(curve[i - 1]!.leverageRatio + 0.03);
    }
  });

  it("sag travel is a fixed fraction of total travel", () => {
    expect(sagTravelMm(REFERENCE_TRAIL_BIKE)).toBeCloseTo(REFERENCE_TRAIL_BIKE.linkage.travelMm * 0.3, 3);
  });
});

describe("bikeGeometry — instant centre and anti-squat", () => {
  it("instant centre sits ahead of the BB and above the axle line at top-out", () => {
    const solution = solveRearEnd(REFERENCE_TRAIL_BIKE, 0);
    expect(solution.instantCentre).not.toBeNull();
    expect(solution.instantCentre!.x).toBeGreaterThan(0);
    expect(solution.instantCentre!.y).toBeLessThan(0);
  });

  it("anti-squat at sag is in a sane range and decreases toward full travel", () => {
    const sag = sagTravelMm(REFERENCE_TRAIL_BIKE);
    const asAtSag = antiSquatPercent(REFERENCE_TRAIL_BIKE, sag);
    const asAtFull = antiSquatPercent(REFERENCE_TRAIL_BIKE, REFERENCE_TRAIL_BIKE.linkage.travelMm);
    expect(asAtSag).not.toBeNull();
    expect(asAtSag!).toBeGreaterThan(80);
    expect(asAtSag!).toBeLessThan(140);
    expect(asAtFull!).toBeLessThan(asAtSag!);
  });
});

describe("bikeGeometry — projection", () => {
  it("all frame and rear-end points at top-out and full travel project inside the default viewBox", () => {
    const bounds = getGeometryBounds(REFERENCE_TRAIL_BIKE);
    const check = (p: Point2D) => {
      const projected = projectToViewBox(p, bounds, DEFAULT_VIEWBOX);
      expect(projected.x).toBeGreaterThanOrEqual(0);
      expect(projected.x).toBeLessThanOrEqual(DEFAULT_VIEWBOX.width);
      expect(projected.y).toBeGreaterThanOrEqual(0);
      expect(projected.y).toBeLessThanOrEqual(DEFAULT_VIEWBOX.height);
    };

    for (const travel of [0, REFERENCE_TRAIL_BIKE.linkage.travelMm]) {
      const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, travel);
      check(pts.bb);
      check(pts.rearAxle);
      check(pts.frontAxle);
      check(pts.headTubeTop);
      check(pts.headTubeBottom);
      check(pts.seatTubeTop);
      check(pts.seatTubeBase);
      check({ x: pts.rearAxle.x - pts.wheelRadiusMm, y: pts.rearAxle.y });
      check({ x: pts.rearAxle.x, y: pts.rearAxle.y + pts.wheelRadiusMm });
      check({ x: pts.frontAxle.x + pts.wheelRadiusMm, y: pts.frontAxle.y });
      check(pts.rearEnd.mainPivot);
      check(pts.rearEnd.horstPivot);
      check(pts.rearEnd.rockerFramePivot);
      check(pts.rearEnd.rockerSeatstayPivot);
      check(pts.rearEnd.rockerShockPivot);
      check(pts.rearEnd.shockLower);
    }
  });
});
