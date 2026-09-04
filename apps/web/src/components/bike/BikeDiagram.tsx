import {
  FRAME_STROKE,
  GROUND_STROKE,
  HUB_FILL,
  PIVOT_FILL,
  PIVOT_STROKE,
  ROCKER_FILL,
  SHOCK_BODY_FILL,
  SHOCK_STROKE,
  useProjectedFrame,
} from "./projection.js";

interface BikeFrameProps {
  travelMm?: number;
}

/** Small dark-filled, light-stroked pivot dot. */
function Pivot({ x, y, r = 3.5 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={PIVOT_FILL} stroke={PIVOT_STROKE} strokeWidth={1} />;
}

export function BikeFrame({ travelMm = 0 }: BikeFrameProps) {
  const { pts, project, viewBoxConfig } = useProjectedFrame(travelMm);
  const { rearEnd } = pts;

  const wheelRadiusPx = Math.abs(
    project({ x: pts.rearAxle.x, y: pts.rearAxle.y + pts.wheelRadiusMm }).y - project(pts.rearAxle).y
  );
  const rimRadiusPx = Math.abs(
    project({ x: pts.rearAxle.x, y: pts.rearAxle.y + pts.wheelRadiusMm - 59 }).y - project(pts.rearAxle).y
  );

  const bb = project(pts.bb);
  const rearAxle = project(pts.rearAxle);
  const frontAxle = project(pts.frontAxle);
  const headTop = project(pts.headTubeTop);
  const headBot = project(pts.headTubeBottom);
  const seatTop = project(pts.seatTubeTop);
  const seatBase = project(pts.seatTubeBase);
  const groundY = project({ x: 0, y: pts.groundY }).y;

  const mainPivot = project(rearEnd.mainPivot);
  const horstPivot = project(rearEnd.horstPivot);
  const rockerFrame = project(rearEnd.rockerFramePivot);
  const rockerSeat = project(rearEnd.rockerSeatstayPivot);
  const rockerShock = project(rearEnd.rockerShockPivot);
  const shockLower = project(rearEnd.shockLower);

  // Simplified fork: a short stanchion segment from the head tube bottom, then
  // a lower-leg segment to the front axle (which carries the rake/offset).
  const forkDirX = pts.headTubeBottom.x - pts.headTubeTop.x;
  const forkDirY = pts.headTubeBottom.y - pts.headTubeTop.y;
  const forkDirLen = Math.hypot(forkDirX, forkDirY) || 1;
  const crownMm = {
    x: pts.headTubeBottom.x + (forkDirX / forkDirLen) * 40,
    y: pts.headTubeBottom.y + (forkDirY / forkDirLen) * 40,
  };
  const crown = project(crownMm);

  const shockMid = {
    x: rockerShock.x + (shockLower.x - rockerShock.x) * 0.55,
    y: rockerShock.y + (shockLower.y - rockerShock.y) * 0.55,
  };

  return (
    <g>
      <line
        x1={0}
        y1={groundY}
        x2={viewBoxConfig.width}
        y2={groundY}
        stroke={GROUND_STROKE}
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Wheels: tyre, rim, hub */}
      <circle cx={rearAxle.x} cy={rearAxle.y} r={wheelRadiusPx} stroke={FRAME_STROKE} strokeWidth={9} />
      <circle cx={frontAxle.x} cy={frontAxle.y} r={wheelRadiusPx} stroke={FRAME_STROKE} strokeWidth={9} />
      <circle cx={rearAxle.x} cy={rearAxle.y} r={rimRadiusPx} stroke={FRAME_STROKE} strokeWidth={1.5} />
      <circle cx={frontAxle.x} cy={frontAxle.y} r={rimRadiusPx} stroke={FRAME_STROKE} strokeWidth={1.5} />
      <circle cx={rearAxle.x} cy={rearAxle.y} r={4} fill={HUB_FILL} />
      <circle cx={frontAxle.x} cy={frontAxle.y} r={4} fill={HUB_FILL} />

      {/* Front triangle: head tube, top tube, actual (kinked) seat tube, down tube */}
      <line x1={headTop.x} y1={headTop.y} x2={headBot.x} y2={headBot.y} stroke={FRAME_STROKE} strokeWidth={10} strokeLinecap="round" />
      <line x1={headTop.x} y1={headTop.y} x2={seatTop.x} y2={seatTop.y} stroke={FRAME_STROKE} strokeWidth={8} strokeLinecap="round" />
      <line x1={bb.x} y1={bb.y} x2={headBot.x} y2={headBot.y} stroke={FRAME_STROKE} strokeWidth={9} strokeLinecap="round" />
      <line x1={seatBase.x} y1={seatBase.y} x2={seatTop.x} y2={seatTop.y} stroke={FRAME_STROKE} strokeWidth={8} strokeLinecap="round" />

      {/* Fork */}
      <line x1={headBot.x} y1={headBot.y} x2={crown.x} y2={crown.y} stroke={FRAME_STROKE} strokeWidth={5} strokeLinecap="round" />
      <line x1={crown.x} y1={crown.y} x2={frontAxle.x} y2={frontAxle.y} stroke={FRAME_STROKE} strokeWidth={9} strokeLinecap="round" />

      {/* Rear end: chainstay link, dropout, seatstay */}
      <line x1={mainPivot.x} y1={mainPivot.y} x2={horstPivot.x} y2={horstPivot.y} stroke={FRAME_STROKE} strokeWidth={6} strokeLinecap="round" />
      <line x1={horstPivot.x} y1={horstPivot.y} x2={rearAxle.x} y2={rearAxle.y} stroke={FRAME_STROKE} strokeWidth={6} strokeLinecap="round" />
      <line x1={horstPivot.x} y1={horstPivot.y} x2={rockerSeat.x} y2={rockerSeat.y} stroke={FRAME_STROKE} strokeWidth={6} strokeLinecap="round" />

      {/* Rocker link */}
      <polygon
        points={`${rockerFrame.x},${rockerFrame.y} ${rockerSeat.x},${rockerSeat.y} ${rockerShock.x},${rockerShock.y}`}
        fill={ROCKER_FILL}
        stroke={FRAME_STROKE}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Shock: thicker body near the rocker eye, thinner shaft to the lower mount */}
      <line x1={rockerShock.x} y1={rockerShock.y} x2={shockMid.x} y2={shockMid.y} stroke={SHOCK_BODY_FILL} strokeWidth={9} strokeLinecap="round" />
      <line x1={shockMid.x} y1={shockMid.y} x2={shockLower.x} y2={shockLower.y} stroke={SHOCK_STROKE} strokeWidth={3} strokeLinecap="round" />

      {/* Pivots and BB */}
      <Pivot x={mainPivot.x} y={mainPivot.y} />
      <Pivot x={horstPivot.x} y={horstPivot.y} />
      <Pivot x={rockerFrame.x} y={rockerFrame.y} />
      <Pivot x={rockerSeat.x} y={rockerSeat.y} />
      <Pivot x={rockerShock.x} y={rockerShock.y} />
      <Pivot x={shockLower.x} y={shockLower.y} />
      <circle cx={bb.x} cy={bb.y} r={10} stroke={FRAME_STROKE} strokeWidth={1.5} />
      <circle cx={bb.x} cy={bb.y} r={5} fill={PIVOT_FILL} />
    </g>
  );
}

export function BikeDiagram({ travelMm = 0, className }: BikeFrameProps & { className?: string }) {
  const { viewBox } = useProjectedFrame(travelMm);
  return (
    <svg viewBox={viewBox} className={className} fill="none" aria-hidden>
      <BikeFrame travelMm={travelMm} />
    </svg>
  );
}
