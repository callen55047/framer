import {
  FRAME_STROKE,
  GROUND_STROKE,
  HUB_FILL,
  PIVOT_FILL,
  SHOCK_STROKE,
  useProjectedFrame,
} from "./projection.js";

interface BikeFrameProps {
  travelMm?: number;
}

export function BikeFrame({ travelMm = 0 }: BikeFrameProps) {
  const { pts, project } = useProjectedFrame(travelMm);
  const { rearEnd } = pts;
  const r = project({ x: pts.rearAxle.x, y: pts.rearAxle.y + pts.wheelRadiusMm }).y - project(pts.rearAxle).y;

  const bb = project(pts.bb);
  const rearAxle = project(pts.rearAxle);
  const frontAxle = project(pts.frontAxle);
  const headTop = project(pts.headTubeTop);
  const headBot = project(pts.headTubeBottom);
  const seatTop = project(pts.seatTubeTop);
  const mainPivot = project(rearEnd.mainPivot);
  const rockerFrame = project(rearEnd.rockerFramePivot);
  const rockerSeat = project(rearEnd.rockerSeatstayPivot);
  const rockerShock = project(rearEnd.rockerShockPivot);
  const shockLower = project(rearEnd.shockLower);
  const groundY = project({ x: 0, y: pts.groundY }).y;

  return (
    <g>
      <line x1={0} y1={groundY} x2={400} y2={groundY} stroke={GROUND_STROKE} strokeWidth={1} strokeDasharray="4 4" />

      <circle cx={rearAxle.x} cy={rearAxle.y} r={Math.abs(r)} stroke={FRAME_STROKE} strokeWidth={2} />
      <circle cx={frontAxle.x} cy={frontAxle.y} r={Math.abs(r)} stroke={FRAME_STROKE} strokeWidth={2} />
      <circle cx={rearAxle.x} cy={rearAxle.y} r={4} fill={HUB_FILL} />
      <circle cx={frontAxle.x} cy={frontAxle.y} r={4} fill={HUB_FILL} />

      <path
        d={`M${headTop.x} ${headTop.y} L${seatTop.x} ${seatTop.y} L${bb.x} ${bb.y} L${headBot.x} ${headBot.y} Z`}
        stroke={FRAME_STROKE}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      <line x1={headBot.x} y1={headBot.y} x2={frontAxle.x} y2={frontAxle.y} stroke={FRAME_STROKE} strokeWidth={2} />
      <line x1={mainPivot.x} y1={mainPivot.y} x2={rearAxle.x} y2={rearAxle.y} stroke={FRAME_STROKE} strokeWidth={2} />
      <line x1={rockerSeat.x} y1={rockerSeat.y} x2={rearAxle.x} y2={rearAxle.y} stroke={FRAME_STROKE} strokeWidth={2} />
      <line x1={rockerFrame.x} y1={rockerFrame.y} x2={rockerSeat.x} y2={rockerSeat.y} stroke={FRAME_STROKE} strokeWidth={2} />
      <line x1={rockerFrame.x} y1={rockerFrame.y} x2={rockerShock.x} y2={rockerShock.y} stroke={FRAME_STROKE} strokeWidth={2} />
      <line x1={rockerShock.x} y1={rockerShock.y} x2={shockLower.x} y2={shockLower.y} stroke={SHOCK_STROKE} strokeWidth={3} strokeLinecap="round" />

      <circle cx={rearAxle.x} cy={rearAxle.y} r={8} stroke={FRAME_STROKE} strokeWidth={1.5} />
      <circle cx={rearAxle.x} cy={rearAxle.y} r={3} fill={PIVOT_FILL} />
      <circle cx={mainPivot.x} cy={mainPivot.y} r={4} fill={PIVOT_FILL} />
      <circle cx={rockerFrame.x} cy={rockerFrame.y} r={4} fill={PIVOT_FILL} />
      <circle cx={bb.x} cy={bb.y} r={5} fill={PIVOT_FILL} />
      <circle cx={bb.x} cy={bb.y} r={10} stroke={FRAME_STROKE} strokeWidth={1.5} />
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
