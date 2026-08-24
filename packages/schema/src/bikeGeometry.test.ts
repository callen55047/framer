import { describe, expect, it } from "vitest";
import {
  REFERENCE_TRAIL_BIKE,
  leverageRatioCurve,
  resolveFramePoints,
  sampleAxlePath,
  solveRearEnd,
} from "./bikeGeometry.js";

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

describe("bikeGeometry", () => {
  it("resolves frame points at sag with realistic dimensions", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    const { frame } = REFERENCE_TRAIL_BIKE;

    expect(pts.bb.y).toBeCloseTo(frame.wheelRadiusMm - frame.bbDropMm);
    expect(pts.bb.x - pts.rearAxle.x).toBeCloseTo(frame.chainstayMm, 0);
    expect(distance(pts.rearAxle, pts.frontAxle)).toBeCloseTo(frame.wheelbaseMm, 0);
    expect(pts.headTubeTop.x - pts.bb.x).toBeCloseTo(frame.reachMm, 0);
    expect(pts.bb.y - pts.headTubeTop.y).toBeCloseTo(frame.stackMm, 0);
  });

  it("axle path is an arc about the main pivot", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    const path = sampleAxlePath(REFERENCE_TRAIL_BIKE, 10);
    const pivot = solveRearEnd(REFERENCE_TRAIL_BIKE, pts.bb, 0).mainPivot;
    const radius = distance(pivot, path[0]);

    for (const point of path) {
      expect(distance(pivot, point)).toBeCloseTo(radius, 0);
    }
  });

  it("axle moves rearward early in travel", () => {
    const path = sampleAxlePath(REFERENCE_TRAIL_BIKE, 20);
    const earlyX = path[2].x;
    const sagX = path[0].x;
    expect(earlyX).toBeLessThan(sagX);
  });

  it("shock shortens monotonically through travel", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    const { linkage } = REFERENCE_TRAIL_BIKE;
    let prevShock = Infinity;
    let prevRocker: { x: number; y: number } | undefined;

    for (let i = 0; i <= 10; i++) {
      const travel = (i / 10) * linkage.travelMm;
      const rearEnd = solveRearEnd(REFERENCE_TRAIL_BIKE, pts.bb, travel, prevRocker);
      prevRocker = rearEnd.rockerSeatstayPivot;
      if (i > 0) {
        expect(rearEnd.shockEyeToEyeMm).toBeLessThanOrEqual(prevShock);
      }
      prevShock = rearEnd.shockEyeToEyeMm;
    }
  });

  it("leverage ratio stays in a sane range", () => {
    const curve = leverageRatioCurve(REFERENCE_TRAIL_BIKE, 20);
    const ratios = curve.slice(1).map((p) => p.leverageRatio);
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(4.5);
    }
  });

  it("rear end solution includes linkage points", () => {
    const pts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
    const { rearEnd } = pts;

    expect(rearEnd.mainPivot).toBeDefined();
    expect(rearEnd.rockerFramePivot).toBeDefined();
    expect(rearEnd.rockerSeatstayPivot).toBeDefined();
    expect(rearEnd.rockerShockPivot).toBeDefined();
    expect(rearEnd.shockLower).toBeDefined();
    expect(rearEnd.shockEyeToEyeMm).toBeGreaterThan(100);
  });
});
