import { REFERENCE_TRAIL_BIKE } from "@framer/schema/browser";

interface TravelScrubberProps {
  travelMm: number;
  onChange: (travelMm: number) => void;
}

export function TravelScrubber({ travelMm, onChange }: TravelScrubberProps) {
  const maxTravel = REFERENCE_TRAIL_BIKE.linkage.travelMm;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>Suspension travel</span>
        <span className="font-mono text-neutral-300">{Math.round(travelMm)} mm</span>
      </div>
      <input
        type="range"
        min={0}
        max={maxTravel}
        step={1}
        value={travelMm}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-blue"
        aria-label="Suspension travel"
      />
      <div className="flex justify-between text-[10px] text-neutral-600">
        <span>Sag</span>
        <span>Full travel</span>
      </div>
    </div>
  );
}
