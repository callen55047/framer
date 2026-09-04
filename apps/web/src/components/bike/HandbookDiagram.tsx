import { useState } from "react";
import { BikeFrame } from "./BikeDiagram.js";
import { ANNOTATION_REGISTRY, INTERACTIVE_DIAGRAMS } from "./diagramRegistry.js";
import { useProjectedFrame } from "./projection.js";
import { AxlePathOverlay } from "./AxlePathOverlay.js";
import { LeverageCurveChart } from "./LeverageCurveChart.js";
import { TravelScrubber } from "./TravelScrubber.js";

interface HandbookDiagramProps {
  diagramId: string;
  annotationId?: string;
  interactive?: boolean;
  className?: string;
  alt: string;
}

export function HandbookDiagram({
  diagramId,
  annotationId,
  interactive = false,
  className = "h-full w-full",
  alt,
}: HandbookDiagramProps) {
  const [travelMm, setTravelMm] = useState(0);
  const effectiveTravel = interactive && INTERACTIVE_DIAGRAMS.has(diagramId) ? travelMm : 0;
  const { pts, project, viewBox, viewBoxConfig } = useProjectedFrame(effectiveTravel);

  const annId = annotationId ?? diagramId;
  const Annotation = ANNOTATION_REGISTRY[annId];

  const showAxlePath = interactive && diagramId === "suspension-travel";
  const showLeverageChart = interactive && (diagramId === "suspension-travel" || diagramId === "anti-squat");

  return (
    <div className="flex flex-col">
      <div className={`relative ${className}`} role="img" aria-label={alt}>
        <svg viewBox={viewBox} className="h-full w-full" fill="none">
          <BikeFrame travelMm={effectiveTravel} />
          {showAxlePath ? <AxlePathOverlay pts={pts} project={project} /> : null}
          {Annotation ? <Annotation pts={pts} project={project} viewBox={viewBoxConfig} travelMm={effectiveTravel} /> : null}
        </svg>
      </div>

      {showLeverageChart ? <LeverageCurveChart travelMm={effectiveTravel} className="mt-4" /> : null}

      {interactive && INTERACTIVE_DIAGRAMS.has(diagramId) ? (
        <TravelScrubber travelMm={travelMm} onChange={setTravelMm} />
      ) : null}
    </div>
  );
}
