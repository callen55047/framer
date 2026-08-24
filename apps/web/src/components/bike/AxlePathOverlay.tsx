import { sampleAxlePath, REFERENCE_TRAIL_BIKE } from "@framer/schema/browser";
import { getGeometryBounds, projectToViewBox, DEFAULT_VIEWBOX } from "@framer/schema/browser";
import { ANNOTATION_STROKE, ANNOTATION_FILL } from "./projection.js";

interface AxlePathOverlayProps {
  className?: string;
}

export function AxlePathOverlay({ className }: AxlePathOverlayProps) {
  const path = sampleAxlePath(REFERENCE_TRAIL_BIKE, 24);
  const bounds = getGeometryBounds(REFERENCE_TRAIL_BIKE);
  const projected = path.map((p) => projectToViewBox(p, bounds, DEFAULT_VIEWBOX));

  const points = projected.map((p) => `${p.x},${p.y}`).join(" ");

  const last = projected[projected.length - 1];
  const prev = projected[projected.length - 2];
  if (!last || !prev) return null;

  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const arrowX = last.x + (dx / len) * 12;
  const arrowY = last.y + (dy / len) * 12;

  return (
    <svg viewBox={`0 0 ${DEFAULT_VIEWBOX.width} ${DEFAULT_VIEWBOX.height}`} className={className} fill="none" aria-hidden>
      <polyline points={points} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="6 4" fill="none" />
      <line x1={last.x} y1={last.y} x2={arrowX} y2={arrowY} stroke={ANNOTATION_STROKE} strokeWidth={2} markerEnd="url(#arrow)" />
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={ANNOTATION_STROKE} />
        </marker>
      </defs>
      <text x={last.x + 10} y={last.y - 8} fill={ANNOTATION_FILL} fontSize={10} fontFamily="system-ui,sans-serif">
        Axle path
      </text>
    </svg>
  );
}
