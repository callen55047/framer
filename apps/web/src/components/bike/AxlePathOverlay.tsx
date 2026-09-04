import { sampleAxlePath, REFERENCE_TRAIL_BIKE, type FramePoints, type Point2D } from "@framer/schema/browser";
import { ANNOTATION_STROKE, ANNOTATION_FILL } from "./projection.js";

interface AxlePathOverlayProps {
  pts: FramePoints;
  project: (p: Point2D) => Point2D;
}

/** Renders inside the shared bike `<svg>` — no separate SVG, no `<defs>` marker ids. */
export function AxlePathOverlay({ project }: AxlePathOverlayProps) {
  const path = sampleAxlePath(REFERENCE_TRAIL_BIKE, 24);
  const projected = path.map((p) => project(p));

  const points = projected.map((p) => `${p.x},${p.y}`).join(" ");

  const last = projected[projected.length - 1];
  const prev = projected[projected.length - 2];
  if (!last || !prev) return null;

  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const tipX = last.x + ux * 10;
  const tipY = last.y + uy * 10;
  const perpX = -uy * 4;
  const perpY = ux * 4;

  return (
    <g>
      <polyline points={points} stroke={ANNOTATION_STROKE} strokeWidth={2} strokeDasharray="6 4" fill="none" />
      <polygon
        points={`${tipX},${tipY} ${last.x - perpX},${last.y - perpY} ${last.x + perpX},${last.y + perpY}`}
        fill={ANNOTATION_STROKE}
      />
      <text x={last.x + 10} y={last.y - 8} fill={ANNOTATION_FILL} fontSize={11} fontFamily="system-ui,sans-serif">
        Axle path
      </text>
    </g>
  );
}
