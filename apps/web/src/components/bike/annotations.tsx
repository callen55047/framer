import {
  antiSquatConstruction,
  REFERENCE_TRAIL_BIKE,
  resolveFramePoints,
  sagTravelMm,
} from "@framer/schema/browser";
import { ANNOTATION_FILL, ANNOTATION_STROKE, GHOST_STROKE, GROUND_STROKE, type AnnotationProps } from "./projection.js";

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} fill={ANNOTATION_FILL} fontSize={13} fontFamily="system-ui,sans-serif">
      {children}
    </text>
  );
}

export function ReachAnnotation({ pts, project }: AnnotationProps) {
  const bb = project(pts.bb);
  const ht = project(pts.headTubeTop);
  const y = bb.y - 8;
  return (
    <g>
      <line x1={bb.x} y1={y} x2={ht.x} y2={y} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <line x1={bb.x} y1={bb.y} x2={bb.x} y2={y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="4 3" />
      <line x1={ht.x} y1={ht.y} x2={ht.x} y2={y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="4 3" />
      <Label x={(bb.x + ht.x) / 2 - 18} y={y - 6}>
        Reach
      </Label>
    </g>
  );
}

export function StackAnnotation({ pts, project }: AnnotationProps) {
  const bb = project(pts.bb);
  const ht = project(pts.headTubeTop);
  const x = bb.x - 12;
  return (
    <g>
      <line x1={x} y1={bb.y} x2={x} y2={ht.y} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <line x1={bb.x} y1={bb.y} x2={x} y2={bb.y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="4 3" />
      <line x1={ht.x} y1={ht.y} x2={x} y2={ht.y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="4 3" />
      <Label x={x - 40} y={(bb.y + ht.y) / 2}>
        Stack
      </Label>
    </g>
  );
}

export function ChainstayAnnotation({ pts, project }: AnnotationProps) {
  const bb = project(pts.bb);
  const rear = project(pts.rearAxle);
  return (
    <g>
      <line x1={bb.x} y1={bb.y} x2={rear.x} y2={rear.y} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <Label x={(bb.x + rear.x) / 2 - 10} y={bb.y - 10}>
        Chainstay
      </Label>
    </g>
  );
}

export function BbDropAnnotation({ pts, project }: AnnotationProps) {
  const bb = project(pts.bb);
  const rear = project(pts.rearAxle);
  const y = rear.y;
  return (
    <g>
      <line x1={rear.x} y1={y} x2={bb.x} y2={y} stroke={GROUND_STROKE} strokeWidth={1} strokeDasharray="4 4" />
      <line x1={bb.x} y1={bb.y} x2={bb.x} y2={y} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <Label x={bb.x + 8} y={(bb.y + y) / 2}>
        BB drop
      </Label>
    </g>
  );
}

export function BbHeightAnnotation({ pts, project, viewBox }: AnnotationProps) {
  const bb = project(pts.bb);
  const groundY = project({ x: 0, y: pts.groundY }).y;
  return (
    <g>
      <line x1={bb.x} y1={bb.y} x2={bb.x} y2={groundY} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <line x1={0} y1={groundY} x2={viewBox.width} y2={groundY} stroke={GROUND_STROKE} strokeWidth={1} strokeDasharray="4 4" />
      <Label x={bb.x + 8} y={(bb.y + groundY) / 2}>
        BB height
      </Label>
    </g>
  );
}

export function WheelbaseAnnotation({ pts, project }: AnnotationProps) {
  const rear = project(pts.rearAxle);
  const front = project(pts.frontAxle);
  const y = rear.y + 28;
  return (
    <g>
      <line x1={rear.x} y1={rear.y} x2={rear.x} y2={y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="4 3" />
      <line x1={front.x} y1={front.y} x2={front.x} y2={y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="4 3" />
      <line x1={rear.x} y1={y} x2={front.x} y2={y} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <Label x={(rear.x + front.x) / 2 - 32} y={y + 16}>
        Wheelbase
      </Label>
    </g>
  );
}

export function WheelSizeAnnotation({ pts, project }: AnnotationProps) {
  const rear = project(pts.rearAxle);
  const front = project(pts.frontAxle);
  const r = project({ x: pts.rearAxle.x, y: pts.rearAxle.y + pts.wheelRadiusMm }).y - rear.y;
  return (
    <g>
      <circle cx={rear.x} cy={rear.y} r={Math.abs(r)} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <circle cx={front.x} cy={front.y} r={Math.abs(r)} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <Label x={(rear.x + front.x) / 2 - 32} y={rear.y - Math.abs(r) - 10}>
        Wheel size
      </Label>
    </g>
  );
}

export function HeadTubeAngleAnnotation({ pts, project }: AnnotationProps) {
  const ht = project(pts.headTubeTop);
  const hb = project(pts.headTubeBottom);
  const refY = hb.y;
  return (
    <g>
      <line x1={hb.x - 44} y1={refY} x2={hb.x + 44} y2={refY} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="4 3" />
      <line x1={ht.x} y1={ht.y} x2={hb.x} y2={hb.y} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <Label x={hb.x + 10} y={hb.y - 8}>
        HTA
      </Label>
    </g>
  );
}

export function SeatTubeAngleAnnotation({ pts, project }: AnnotationProps) {
  const bb = project(pts.bb);
  const st = project(pts.seatTubeTop);
  const refY = bb.y;
  return (
    <g>
      <line x1={bb.x - 44} y1={refY} x2={bb.x + 44} y2={refY} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="4 3" />
      <line x1={bb.x} y1={bb.y} x2={st.x} y2={st.y} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="6 3" />
      <Label x={bb.x - 34} y={bb.y - 18}>
        Effective STA
      </Label>
    </g>
  );
}

export function AntiSquatAnnotation({ pts, project, travelMm }: AnnotationProps) {
  const construction = antiSquatConstruction(REFERENCE_TRAIL_BIKE, travelMm);
  if (!construction) return null;

  const { instantCentre, ringPoint, cogPoint, instantForceCentre, contactPatch, frontAxleVertical, percent } =
    construction;
  const mainPivot = project(pts.rearEnd.mainPivot);
  const rockerFrame = project(pts.rearEnd.rockerFramePivot);
  const ic = project(instantCentre);
  const ring = project(ringPoint);
  const cog = project(cogPoint);
  const rear = project(pts.rearAxle);
  const ifc = project(instantForceCentre);
  const contact = project(contactPatch);
  const frontVertical = project(frontAxleVertical);

  return (
    <g>
      <line x1={mainPivot.x} y1={mainPivot.y} x2={ic.x} y2={ic.y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="3 3" />
      <line x1={rockerFrame.x} y1={rockerFrame.y} x2={ic.x} y2={ic.y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="3 3" />
      <circle cx={ic.x} cy={ic.y} r={5} stroke={ANNOTATION_STROKE} strokeWidth={2} fill="none" />
      <Label x={ic.x + 8} y={ic.y - 8}>
        IC
      </Label>

      <line x1={ring.x} y1={ring.y} x2={cog.x} y2={cog.y} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="6 3" />
      <Label x={(ring.x + cog.x) / 2 - 26} y={(ring.y + cog.y) / 2 - 8}>
        Chain line
      </Label>

      <line x1={rear.x} y1={rear.y} x2={ifc.x} y2={ifc.y} stroke={ANNOTATION_STROKE} strokeWidth={1} strokeDasharray="3 3" />
      <line x1={contact.x} y1={contact.y} x2={frontVertical.x} y2={frontVertical.y} stroke={ANNOTATION_STROKE} strokeWidth={2.5} />
      <Label x={frontVertical.x - 70} y={Math.max(14, frontVertical.y - 8)}>
        {`Anti-squat ≈ ${Math.round(percent)}%`}
      </Label>
    </g>
  );
}

export function SuspensionTravelAnnotation({ project, viewBox }: AnnotationProps) {
  const topOutPts = resolveFramePoints(REFERENCE_TRAIL_BIKE, 0);
  const fullTravelPts = resolveFramePoints(REFERENCE_TRAIL_BIKE, REFERENCE_TRAIL_BIKE.linkage.travelMm);
  const topOutAxle = project(topOutPts.rearAxle);
  const fullAxle = project(fullTravelPts.rearAxle);
  const sag = sagTravelMm(REFERENCE_TRAIL_BIKE);

  const ghostMain = project(fullTravelPts.rearEnd.mainPivot);
  const ghostHorst = project(fullTravelPts.rearEnd.horstPivot);
  const ghostRockerFrame = project(fullTravelPts.rearEnd.rockerFramePivot);
  const ghostRockerSeat = project(fullTravelPts.rearEnd.rockerSeatstayPivot);
  const ghostRockerShock = project(fullTravelPts.rearEnd.rockerShockPivot);
  const ghostAxle = project(fullTravelPts.rearAxle);

  const arrowX = topOutAxle.x - 26;

  return (
    <g>
      <g opacity={0.55} strokeDasharray="4 3">
        <line x1={ghostMain.x} y1={ghostMain.y} x2={ghostHorst.x} y2={ghostHorst.y} stroke={GHOST_STROKE} strokeWidth={4} />
        <line x1={ghostHorst.x} y1={ghostHorst.y} x2={ghostAxle.x} y2={ghostAxle.y} stroke={GHOST_STROKE} strokeWidth={4} />
        <line x1={ghostHorst.x} y1={ghostHorst.y} x2={ghostRockerSeat.x} y2={ghostRockerSeat.y} stroke={GHOST_STROKE} strokeWidth={4} />
        <polygon
          points={`${ghostRockerFrame.x},${ghostRockerFrame.y} ${ghostRockerSeat.x},${ghostRockerSeat.y} ${ghostRockerShock.x},${ghostRockerShock.y}`}
          fill="none"
          stroke={GHOST_STROKE}
          strokeWidth={2}
        />
        <circle cx={ghostAxle.x} cy={ghostAxle.y} r={6} stroke={GHOST_STROKE} strokeWidth={2} fill="none" />
      </g>

      <line x1={arrowX} y1={topOutAxle.y} x2={arrowX} y2={fullAxle.y} stroke={ANNOTATION_STROKE} strokeWidth={2} />
      <line x1={arrowX - 5} y1={topOutAxle.y} x2={arrowX + 5} y2={topOutAxle.y} stroke={ANNOTATION_STROKE} strokeWidth={2} />
      <line x1={arrowX - 5} y1={fullAxle.y} x2={arrowX + 5} y2={fullAxle.y} stroke={ANNOTATION_STROKE} strokeWidth={2} />
      <Label x={Math.max(4, arrowX - 46)} y={(topOutAxle.y + fullAxle.y) / 2}>
        {`${REFERENCE_TRAIL_BIKE.linkage.travelMm} mm`}
      </Label>
      <Label x={Math.min(viewBox.width - 90, arrowX + 12)} y={fullAxle.y + 14}>
        {`Sag ≈ ${Math.round(sag)} mm`}
      </Label>
    </g>
  );
}
