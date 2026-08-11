import { describe, expect, it } from "vitest";
import { extractVisibleText } from "./html.js";

describe("extractVisibleText", () => {
  it("removes Shopify cart drawer upsell blocks from visible text", () => {
    const html = `
      <body>
        <div class="cart-drawer">
          New products!
          Reserve 42|49 Turbulent Aero Wheelset 700c $2,499.99
        </div>
        <main>
          <h1>Instinct C50</h1>
          <p>Regular price $6,999.99</p>
        </main>
      </body>
    `;

    const text = extractVisibleText(html);

    expect(text).not.toMatch(/turbulent/i);
    expect(text).toMatch(/instinct c50/i);
    expect(text).toMatch(/6,999\.99/);
  });
});
