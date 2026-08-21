import { describe, expect, it } from "vitest";
import { buildReferencePageText } from "./referencePageText.js";

describe("buildReferencePageText", () => {
  it("preserves geometry table columns on separate pipe-delimited rows", () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>Geometry table</h2>
      <table>
        <tr><th></th><th>S</th><th>M</th><th>L</th></tr>
        <tr><th>Reach</th><td>400</td><td>423</td><td>454</td></tr>
        <tr><th>Stack</th><td>590</td><td>610</td><td>630</td></tr>
      </table>
    </body></html>`;

    const text = buildReferencePageText(html);
    expect(text).toContain("S | M | L");
    expect(text).toContain("Reach | 400 | 423 | 454");
    expect(text).toContain("Stack | 590 | 610 | 630");
    expect(text).toContain("## Geometry table");
  });

  it("filters to a section keyword when requested", () => {
    const html = `<body>
      <h2>Overview</h2><p>Marketing fluff</p>
      <h2>Geometry</h2>
      <table><tr><th>Reach</th><td>454</td></tr></table>
    </body>`;
    const text = buildReferencePageText(html, { section: "geometry" });
    expect(text.toLowerCase()).toContain("geometry");
  });
});
