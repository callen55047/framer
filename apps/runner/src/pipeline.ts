import { computeVariantAggregate, RefreshListingInputSchema, type JobRecord } from "@framer/schema";
import { completeJob, recordScheduledListingFailureRemote } from "./lib/jobApi.js";
import { runStage, StageFailedError } from "./lib/stageRunner.js";
import { fetchStage } from "./stages/fetchStage.js";
import { validateStage } from "./stages/validateStage.js";
import { extractStage } from "./stages/extractStage.js";
import { resolveStage } from "./stages/resolveStage.js";
import { persistStage } from "./stages/persistStage.js";
import { autoTitleStage } from "./stages/autoTitleStage.js";

function domainFromUrl(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/**
 * RefreshListing: fetch -> validate -> extract -> resolve -> persist. Each Stage is
 * retried in place (see runStage); if a Stage exhausts its attempts the
 * whole pipeline stops there — a broken extract Stage never re-fetches a
 * page that already succeeded. See CONTEXT.md#Job / #Stage.
 */
export async function runRefreshListing(job: JobRecord): Promise<void> {
  const input = RefreshListingInputSchema.parse(job.input);

  const fetched = await runStage(job.id, "fetch", () => fetchStage(job.id, input.url), (r) => r.artifactId);
  await runStage(job.id, "validate", () =>
    validateStage({
      pageText: fetched.text,
      html: fetched.html,
      pageUrl: input.url,
      listingId: input.listingId,
      itemKind: input.itemKind,
    })
  );
  const extracted = await runStage(job.id, "extract", () =>
    extractStage({
      pageText: fetched.text,
      html: fetched.html,
      pageUrl: input.url,
      referenceSource: fetched.referenceSource,
      itemKind: input.itemKind,
      expectedCategory: input.expectedCategory,
    })
  );
  const resolved = await runStage(job.id, "resolve", () =>
    resolveStage(extracted.extraction, input.expectedCategory)
  );

  const scrapedAt = new Date().toISOString();
  const aggregate = computeVariantAggregate(extracted.variants);
  await runStage(job.id, "persist", () =>
    persistStage(
      input.listingId,
      resolved.productId,
      extracted.extraction,
      scrapedAt,
      extracted.variants,
      input.watchIds,
      input.discoveryFilter ?? null
    )
  );

  if (input.watchIds?.length) {
    await autoTitleStage({
      watchIds: input.watchIds,
      listingTitle: extracted.extraction.title,
      domain: domainFromUrl(input.url),
      itemKind: input.itemKind,
      expectedCategory: input.expectedCategory,
    });
  }

  await completeJob(job.id, {
    price: extracted.extraction.price,
    currency: extracted.extraction.currency,
    inStock: extracted.extraction.inStock,
    title: extracted.extraction.title,
    scrapedAt,
    productId: resolved.productId,
    resolutionGrade: resolved.grade,
    variantCount: extracted.variants.length,
    lowestInStockPrice: aggregate.lowestInStockPrice,
    highestInStockPrice: aggregate.highestInStockPrice,
  });
}

async function runAcknowledge(job: JobRecord): Promise<void> {
  await completeJob(job.id, {
    acknowledgedAt: new Date().toISOString(),
    note: typeof job.input === "object" && job.input && "label" in job.input ? String(job.input.label) : "acknowledged",
  });
}

export async function runJob(job: JobRecord): Promise<void> {
  try {
    switch (job.kind) {
      case "Acknowledge":
        await runAcknowledge(job);
        break;
      case "RefreshListing":
        await runRefreshListing(job);
        break;
      default:
        throw new Error(`job kind "${job.kind}" has no Runner implementation yet`);
    }
  } catch (err) {
    if (err instanceof StageFailedError) {
      if (job.kind === "RefreshListing") {
        const input = RefreshListingInputSchema.parse(job.input);
        if (input.taskOrigin === "sweep") {
          const httpStatus =
            err.stage === "fetch" && err.fetchStatus !== undefined ? err.fetchStatus : undefined;
          try {
            await recordScheduledListingFailureRemote(input.listingId, httpStatus);
          } catch (inactiveErr) {
            console.error(`[job ${job.id}] failed to record scheduled listing failure:`, inactiveErr);
          }
        }
      }
      console.error(`[job ${job.id}] terminal failure at stage "${err.stage}": ${err.message}`);
      return;
    }
    console.error(`[job ${job.id}] unexpected error:`, err);
  }
}
