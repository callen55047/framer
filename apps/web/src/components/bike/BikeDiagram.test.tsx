import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_VIEWBOX } from "@framer/schema/browser";
import { BikeFrame } from "./BikeDiagram.js";
import { ANNOTATION_REGISTRY } from "./diagramRegistry.js";
import { useProjectedFrame } from "./projection.js";

function renderFrame(travelMm: number): string {
  return renderToStaticMarkup(
    <svg viewBox={`0 0 ${DEFAULT_VIEWBOX.width} ${DEFAULT_VIEWBOX.height}`} fill="none">
      <BikeFrame travelMm={travelMm} />
    </svg>
  );
}

/** Every numeric coordinate/length attribute value found in an SVG markup string. */
function extractNumericAttrs(markup: string): number[] {
  const values: number[] = [];
  const attrRegex = /\b(?:x1|y1|x2|y2|cx|cy|r|points)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(markup))) {
    const raw = match[1] ?? "";
    for (const token of raw.split(/[\s,]+/)) {
      if (token === "") continue;
      const n = Number(token);
      values.push(n);
    }
  }
  return values;
}

describe("BikeFrame", () => {
  it("renders a valid viewBox and no NaN/undefined coordinates at top-out", () => {
    const markup = renderFrame(0);
    expect(markup).toContain(`viewBox="0 0 ${DEFAULT_VIEWBOX.width} ${DEFAULT_VIEWBOX.height}"`);
    expect(markup).not.toMatch(/NaN|undefined/);
  });

  it("renders no NaN/undefined coordinates at full travel", () => {
    const markup = renderFrame(160);
    expect(markup).not.toMatch(/NaN|undefined/);
  });

  it("renders the rocker as a filled polygon and the shock as thick+thin strokes", () => {
    const markup = renderFrame(0);
    expect(markup).toContain("<polygon");
    // shock body (thick) and shaft (thin) are both <line> elements with distinct stroke-width
    expect(markup).toMatch(/stroke-width="9"/);
  });

  it("renders tyres, rims and hubs as circles", () => {
    const markup = renderFrame(0);
    const circleCount = (markup.match(/<circle/g) ?? []).length;
    expect(circleCount).toBeGreaterThanOrEqual(8); // 2 tyres + 2 rims + 2 hubs + BB + pivots
  });

  it("keeps every coordinate inside (or very close to) the viewBox at top-out and full travel", () => {
    const margin = 20; // stroke widths/labels can extend slightly past the plotted viewBox
    for (const travelMm of [0, 160]) {
      const markup = renderFrame(travelMm);
      const values = extractNumericAttrs(markup);
      for (const v of values) {
        expect(Number.isNaN(v)).toBe(false);
        expect(v).toBeGreaterThanOrEqual(-margin);
        expect(v).toBeLessThanOrEqual(DEFAULT_VIEWBOX.width + margin);
      }
    }
  });
});

describe("ANNOTATION_REGISTRY", () => {
  it("every registered annotation renders without throwing at top-out and full travel", () => {
    for (const [id, Annotation] of Object.entries(ANNOTATION_REGISTRY)) {
      for (const travelMm of [0, 160]) {
        const render = () => {
          function Harness() {
            const { pts, project, viewBox: viewBoxString, viewBoxConfig } = useProjectedFrame(travelMm);
            return (
              <svg viewBox={viewBoxString} fill="none">
                <BikeFrame travelMm={travelMm} />
                <Annotation pts={pts} project={project} viewBox={viewBoxConfig} travelMm={travelMm} />
              </svg>
            );
          }
          return renderToStaticMarkup(<Harness />);
        };
        expect(render, `annotation "${id}" at travel ${travelMm}mm`).not.toThrow();
      }
    }
  });
});
