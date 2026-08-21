import { Bike } from "lucide-react";
import { PageHeader } from "../components/PageHeader.js";
import { EmptyState } from "../components/EmptyState.js";

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
      <EmptyState
        icon={Bike}
        title="No Specs yet"
        description="The Garage renders builds from Product Specs (stack, reach, head angle, fork travel). Once ExtractSpecs jobs populate a few Products, builds land here."
      />
    </div>
  );
}
