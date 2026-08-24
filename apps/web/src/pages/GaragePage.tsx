import { Bike } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader.js";
import { EmptyState } from "../components/EmptyState.js";
import { SpecLabel } from "../components/SpecLabel.js";

const GEOMETRY_SPEC_KEYS = [
  "headTubeAngleDeg",
  "seatTubeAngleDeg",
  "reachMm",
  "stackMm",
  "chainstayMm",
  "bbDropMm",
  "wheelbaseMm",
] as const;

/**
 * Stub. The Garage renders parametric geometry derived from scraped Specs
 * (stack, reach, head angle, etc.) — not a 3D asset library. See
 * docs/ARCHITECTURE.md#garage-rendering. It needs the ExtractSpecs
 * job kind and a populated Spec bag before there's anything to render, so
 * it's sequenced after the Watchlist slice, not before.
 */
export function GaragePage() {
  return (
    <div>
      <PageHeader
        title="Garage"
        subtitle="Parametric bike geometry, built from real scraped Specs — not a 3D asset library."
      />
      <div className="mx-auto max-w-3xl px-8 py-6">
        <EmptyState
          icon={Bike}
          title="No Specs yet"
          description="The Garage renders builds from Product Specs (stack, reach, head angle, fork travel). Once ExtractSpecs jobs populate a few Products, builds land here."
        />
        <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
          <h2 className="text-sm font-medium text-neutral-200">Geometry metrics</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Compared frame measurements come from the{" "}
            <Link to="/handbook" className="text-brand-blue hover:underline">
              Handbook
            </Link>
            .
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {GEOMETRY_SPEC_KEYS.map((specKey) => (
              <li key={specKey}>
                <SpecLabel
                  specKey={specKey}
                  className="inline-block rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-sm"
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
