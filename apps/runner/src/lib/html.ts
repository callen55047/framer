import * as cheerio from "cheerio";

/** Strips script/style/nav noise and returns visible text, used both as the
 * model's input and as the Grounding source text. */
export function extractVisibleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer").remove();
  // Shopify cart drawers and third-party upsell carousels embed unrelated products
  // ahead of the PDP in flattened body text, which confuses model extraction.
  $(
    [
      "cart-drawer",
      "#cart-drawer",
      ".cart-drawer",
      "[data-cart-drawer]",
      "#CartDrawer",
      "#sideCart",
      ".side-cart",
      "cart-items",
      "cart-notification",
      "#cart",
      ".cart__contents",
      ".product-latest",
      "[class*='ewck-']",
    ].join(", ")
  ).remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

/** A short excerpt for prompting — full pages can be tens of thousands of
 * tokens, most of it navigation chrome irrelevant to price extraction. */
export function truncateForPrompt(text: string, maxChars = 12000): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
