import type { FramePoints, Point2D } from "@framer/schema/browser";
import { ANNOTATION_FILL, ANNOTATION_STROKE, GROUND_STROKE } from "./projection.js";

interface AnnotationProps {
  pts: FramePoints;
  project: (p: Point2D) => Point2D;
}

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} fill={ANNOTATION_FILL} fontSize={11} fontFamily="system-ui,sans-serif">
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
      <Label x={x - 36} y={(bb.y + ht.y) / 2}>
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
      <Label x={(bb.x + rear.x) / 2} y={bb.y - 10}>
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
      <Label x={bb.x + 6} y={(bb.y + y) / 2}>
        BB drop
      </Label>
    </g>
  );
}

export function BbHeightAnnotation({ pts, project }: AnnotationProps) {
  const bb = project(pts.bb);
  const groundY = project({ x: 0, y: pts.groundY }).y;
  return (
    <g>
      <line x1={bb.x} y1={bb.y} x2={bb.x} y2={groundY} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <line x1={0} y1={groundY} x2={400} y2={groundY} stroke={GROUND_STROKE} strokeWidth={1} strokeDasharray="4 4" />
      <Label x={bb.x + 6} y={(bb.y + groundY) / 2}>
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
      <Label x={(rear.x + front.x) / 2 - 28} y={y + 14}>
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
      <Label x={(rear.x + front.x) / 2 - 28} y={rear.y - Math.abs(r) - 8}>
        Wheel size
      </Label>
    </g>
  );
}

export function HeadTubeAngleAnnotation({ pts, project }: AnnotationProps) {
  const ht = project(pts.headTubeTop);
  const hb = project(pts.headTubeBottom);
  const groundY = ht.y + 20;
  return (
    <g>
      <line x1={ht.x - 40} y1={groundY} x2={ht.x + 40} y2={groundY} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="4 3" />
      <line x1={ht.x} y1={ht.y} x2={hb.x} y2={hb.y} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <Label x={hb.x + 8} y={hb.y - 6}>
        HTA
      </Label>
    </g>
  );
}

export function SeatTubeAngleAnnotation({ pts, project }: AnnotationProps) {
  const bb = project(pts.bb);
  const st = project(pts.seatTubeTop);
  const groundY = bb.y + 20;
  return (
    <g>
      <line x1={bb.x - 40} y1={groundY} x2={bb.x + 40} y2={groundY} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="4 3" />
      <line x1={bb.x} y1={bb.y} x2={st.x} y2={st.y} stroke={ANNOTATION_STROKE} strokeWidth={3} />
      <Label x={bb.x - 30} y={bb.y - 16}>
        STA
      </Label>
    </g>
  );
}

export function AntiSquatAnnotation({ pts, project }: AnnotationProps) {
  const bb = project(pts.bb);
  const pivot = project(pts.rearEnd.mainPivot);
  const rear = project(pts.rearAxle);
  const chainring = project(pts.bb);
  const cog = project(pts.rearAxle);
  return (
    <g>
      <line x1={chainring.x} y1={chainring.y} x2={cog.x} y2={cog.y} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="6 3" />
      <line x1={pivot.x} y1={pivot.y} x2={rear.x} y2={rear.y + 30} stroke={ANNOTATION_STROKE} strokeWidth={2} />
      <circle cx={pivot.x} cy={pivot.y} r={5} stroke={ANNOTATION_STROKE} strokeWidth={2} fill="none" />
      <Label x={pivot.x + 8} y={pivot.y - 8}>
        IC / pivot
      </Label>
      <Label x={(chainring.x + cog.x) / 2 - 20} y={chainring.y - 8}>
        Chain line
      </Label>
    </g>
  );
}
