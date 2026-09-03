import type { Scenario } from "./assistantBenchmark.js";
import { GAP_BRAND, GAP_MODEL, GAP_YEAR } from "./seed.js";

/**
 * The Assistant Benchmark corpus. Each Scenario defends one section of
 * SYSTEM_PROMPT in chatService.ts — see docs/local-model-benchmarks.md for
 * how these are run and scored.
 */

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const LOOK_IT_UP_RE = /look (it |that )?up yourself|check (it |that )?yourself|go (look|check|search)/i;

export const MAX_LATENCY_MS = 45000;

export const SCENARIOS: Scenario[] = [
  {
    id: "price-lookup",
    description: "\"how much is X\" should chain searchProducts → getProductListings, cite a real number, stay dry.",
    turns: [
      {
        user: "How much is the Fox 36 Factory 2024?",
        expect: {
          requireTools: ["searchProducts", "getProductListings"],
          forbidTools: ["askClarifyingQuestion"],
          mustMatch: [/\$?899/, /jenson/i],
          mustNotMatch: [UUID_RE, LOOK_IT_UP_RE],
          maxChars: 500,
        },
      },
    ],
  },
  {
    id: "price-history",
    description: "A trend question should pull getPriceHistory, not just the latest price.",
    turns: [
      {
        user: "Has the Fox 36 Factory's price changed recently, and where's it cheapest?",
        expect: {
          requireTools: ["searchProducts", "getProductListings", "getPriceHistory"],
          mustNotMatch: [UUID_RE, LOOK_IT_UP_RE],
          maxChars: 600,
        },
      },
    ],
  },
  {
    id: "my-watches",
    description: "\"my watches\" routes to listWatches, not a catalog search.",
    turns: [
      {
        user: "What am I watching right now?",
        expect: {
          requireTools: ["listWatches"],
          mustNotMatch: [UUID_RE, LOOK_IT_UP_RE],
          maxChars: 500,
        },
      },
    ],
  },
  {
    id: "which-shops",
    description: "\"which shops\" routes to listRetailers.",
    turns: [
      {
        user: "Which retailers do you actually track prices from?",
        expect: {
          requireTools: ["listRetailers"],
          maxChars: 500,
        },
      },
    ],
  },
  {
    id: "compatibility-pass",
    description: "checkCompatibility with a real pass — Fox 36 Factory fits the Rocky Mountain Altitude.",
    turns: [
      {
        user: "Does the Fox 36 Factory fit my Rocky Mountain Altitude 2024?",
        expect: {
          requireTools: ["checkCompatibility"],
          forbidTools: ["askClarifyingQuestion"],
          toolArgs: [
            {
              tool: "checkCompatibility",
              description: "resolves both products by brand/model, not UUID",
              predicate: (args) =>
                typeof args.productABrand === "string" ||
                typeof args.productAId === "string" ||
                typeof args.productBBrand === "string" ||
                typeof args.productBId === "string",
            },
          ],
          mustMatch: [/compat|fit/i],
          mustNotMatch: [UUID_RE, LOOK_IT_UP_RE],
          maxChars: 500,
        },
      },
    ],
  },
  {
    id: "compatibility-fail",
    description: "checkCompatibility with a real fail — the Lyrik's 180mm exceeds the Altitude's 160mm max.",
    turns: [
      {
        user: "Can I put a RockShox Lyrik Ultimate on my Rocky Mountain Altitude 2024?",
        expect: {
          requireTools: ["checkCompatibility"],
          mustMatch: [/(not|n't|incompat|exceed|too much|180).*?/i],
          mustNotMatch: [UUID_RE, LOOK_IT_UP_RE],
          maxChars: 500,
        },
      },
    ],
  },
  {
    id: "find-cockpit-parts",
    description: "\"parts for my build\" + stems/bars → findCompatibleProducts with slot: cockpit.",
    turns: [
      {
        user: "What stems fit my Rocky Mountain Altitude 2024?",
        expect: {
          requireTools: ["findCompatibleProducts"],
          toolArgs: [
            {
              tool: "findCompatibleProducts",
              description: "called with slot: cockpit",
              predicate: (args) => args.slot === "cockpit",
            },
          ],
          mustMatch: [/raceface|aeffect|oneup/i],
          mustNotMatch: [UUID_RE, LOOK_IT_UP_RE],
          maxChars: 600,
        },
      },
    ],
  },
  {
    id: "specs-geometry-citation",
    description: "A geometry question should searchReference then fetchReferencePage and cite the source.",
    turns: [
      {
        user: "What's the reach on a size L Rocky Mountain Altitude 2024?",
        expect: {
          requireTools: ["searchReference", "fetchReferencePage"],
          mustMatch: [/geometrygeeks|geometry geeks/i, /450|475/],
          mustNotMatch: [UUID_RE, LOOK_IT_UP_RE],
          maxChars: 500,
        },
      },
    ],
  },
  {
    id: "handbook-term",
    description: "An MTB term definition should hit getHandbookEntry before the model explains it from memory.",
    turns: [
      {
        user: "What's head tube angle, and does it matter?",
        expect: {
          requireTools: ["getHandbookEntry"],
          maxChars: 700,
        },
      },
    ],
  },
  {
    id: "no-tool-call-guardrail",
    description:
      "Regression for the buffered no-tool-call guardrail: a bare price question must never be answered from memory.",
    turns: [
      {
        user: "Quick, what's the DT Swiss XM 1700 SPLINE 29 going for?",
        expect: {
          requireTools: ["searchProducts"],
          mustNotMatch: [UUID_RE, LOOK_IT_UP_RE],
          maxChars: 500,
        },
      },
    ],
  },
  {
    id: "planted-gap-no-data",
    description:
      "The single most important hard rule: a brand/model/year with nothing in the catalog or reference sources must produce a no-data reply, never a fabricated price.",
    turns: [
      {
        user: `How much is a ${GAP_YEAR} ${GAP_BRAND} ${GAP_MODEL}?`,
        expect: {
          requireTools: ["searchProducts"],
          mustMatch: [/no data|nothing|not (in|found)|couldn'?t find/i],
          mustNotMatch: [/\$\d/, UUID_RE, LOOK_IT_UP_RE],
          maxChars: 400,
        },
      },
    ],
  },
  {
    id: "off-topic-sarcasm-confined",
    description: "Sarcasm is allowed here, and only here.",
    turns: [
      {
        user: "What's the weather like today?",
        expect: {
          forbidTools: [
            "searchProducts",
            "getProductListings",
            "checkCompatibility",
            "findCompatibleProducts",
            "searchReference",
          ],
          maxChars: 300,
        },
      },
    ],
  },
  {
    id: "ambiguous-stem",
    description:
      "\"stem\" is genuinely ambiguous (handlebar stem vs. tubeless valve stem) and must produce a clarification, then route correctly once answered.",
    turns: [
      {
        user: "I need a new stem for my Rocky Mountain Altitude, what do you have?",
        expect: {
          endsWithClarification: true,
          clarificationOptionsRange: [2, 4],
        },
      },
      {
        user: "Handlebar stem.",
        expect: {
          requireTools: ["findCompatibleProducts"],
          toolArgs: [
            {
              tool: "findCompatibleProducts",
              description: "called with slot: cockpit",
              predicate: (args) => args.slot === "cockpit",
            },
          ],
          mustMatch: [/raceface|aeffect|oneup/i],
          maxChars: 600,
        },
      },
    ],
  },
  {
    id: "research-escalation",
    description:
      "A question the recorded reference pages cannot answer should escalate to enqueueResearch and point at Tasks on Profile.",
    turns: [
      {
        user: "Is there a known frame crack recall on the Nukeproof Giga?",
        expect: {
          requireTools: ["enqueueResearch"],
          mustMatch: [/task/i],
          maxChars: 500,
        },
      },
    ],
  },
];
