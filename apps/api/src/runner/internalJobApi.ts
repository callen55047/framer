import { LOCAL_OWNER_ID, ExtractedVariantSchema, VariantDiscoveryFilterSchema, type JobKind, type JobRecord, type Spec } from "@framer/schema";
import type { JobApi } from "@framer/runner/lib/jobApi.js";
import { withTransaction, pool } from "../db/pool.js";
import { mapJob } from "../lib/mappers.js";
import { resolveProduct } from "../lib/resolution.js";
import {
  claimJob,
  completeJobForAgent,
  failJobForAgent,
  heartbeatJob,
  recordJobArtifact,
  reportJobStage,
} from "../services/jobsService.js";
import { persistPricePoint, markListingInactive, recordScheduledFailure } from "../services/listingsService.js";
import { mergeProductSpecs } from "../services/productsService.js";
import { reconcileVariantSnapshot } from "../services/variantsService.js";

export function createInternalJobApi(agentId: string, leaseSeconds: number): JobApi {
  let activeLease: { jobId: string; token: string } | null = null;

  const requireLease = (jobId: string): string => {
    const token = activeLease?.jobId === jobId ? activeLease.token : null;
    if (!token) throw new Error(`no active lease for job ${jobId}`);
    return token;
  };

  return {
    clearActiveLease() {
      activeLease = null;
    },

    getActiveLeaseToken(jobId: string) {
      if (!activeLease || activeLease.jobId !== jobId) return null;
      return activeLease.token;
    },

    async claimJob(kinds?: JobKind[]) {
      const result = await claimJob(agentId, kinds && kinds.length > 0 ? kinds : null, leaseSeconds);
      if (!result) {
        activeLease = null;
        return null;
      }
      activeLease = { jobId: result.job.id as string, token: result.leaseToken };
      return mapJob(result.job) as JobRecord;
    },

    async heartbeatJob(jobId: string) {
      const ok = await heartbeatJob(jobId, agentId, requireLease(jobId), leaseSeconds);
      if (!ok) throw new Error(`heartbeat rejected for job ${jobId}`);
    },

    async reportStage(jobId, name, status, attempt, extra) {
      const stage = await reportJobStage(
        jobId,
        { agentId, leaseToken: requireLease(jobId) },
        { name, status, attempt, artifactId: extra?.artifactId, error: extra?.error }
      );
      if (!stage) throw new Error(`stage report rejected for job ${jobId}`);
    },

    async recordArtifact(jobId, stage, contentType, path, byteSize) {
      const artifact = await recordJobArtifact(
        jobId,
        { agentId, leaseToken: requireLease(jobId) },
        { stage, contentType, path, byteSize }
      );
      if (!artifact) throw new Error(`artifact record rejected for job ${jobId}`);
      return { id: artifact.id as string };
    },

    async completeJob(jobId, output) {
      const job = await completeJobForAgent(jobId, { agentId, leaseToken: requireLease(jobId) }, output);
      if (!job) throw new Error(`complete rejected for job ${jobId}`);
      activeLease = null;
    },

    async failJob(jobId, stage, error, terminal) {
      const job = await failJobForAgent(
        jobId,
        { agentId, leaseToken: requireLease(jobId) },
        { stage, error, terminal }
      );
      if (!job) throw new Error(`fail rejected for job ${jobId}`);
      if (terminal) activeLease = null;
    },

    async resolveProductRemote(input) {
      return withTransaction((client) => resolveProduct(client, input));
    },

    async persistVariantSnapshot(listingId, input) {
      await reconcileVariantSnapshot(listingId, {
        productId: input.productId,
        title: input.title,
        scrapedAt: input.scrapedAt,
        variants: input.variants.map((variant) => ExtractedVariantSchema.parse(variant)),
        watchIds: input.watchIds,
        discoveryFilter:
          input.discoveryFilter === undefined
            ? undefined
            : input.discoveryFilter === null
              ? null
              : VariantDiscoveryFilterSchema.parse(input.discoveryFilter),
      });
    },

    async persistPricePoint(listingId, input) {
      await persistPricePoint(listingId, input);
    },

    async markListingUnsupported(listingId, reason) {
      await pool.query(
        `update listings set status = 'unsupported', updated_at = datetime('now') where id = $1`,
        [listingId]
      );
      void reason;
    },

    async recordScheduledListingFailure(listingId, httpStatus) {
      if (httpStatus === 404) {
        await markListingInactive(listingId);
        return;
      }
      await recordScheduledFailure(listingId, { httpStatus });
    },

    async setWatchDisplayTitle(watchId, displayTitle) {
      await pool.query(
        `update watches set display_title = $2, title_source = 'auto'
         where id = $1 and owner_id = $3 and title_source = 'auto' and display_title is null`,
        [watchId, displayTitle, LOCAL_OWNER_ID]
      );
    },

    async mergeProductSpecs(productId, specs) {
      await mergeProductSpecs(productId, specs as Spec);
    },
  };
}
