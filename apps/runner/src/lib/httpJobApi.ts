import type { JobKind, JobRecord } from "@framer/schema";
import { config } from "../config.js";
import type { JobApi } from "./jobApi.js";

let activeLease: { jobId: string; token: string } | null = null;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.agentToken}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

function requireLeaseToken(jobId: string): string {
  const token = activeLease?.jobId === jobId ? activeLease.token : null;
  if (!token) throw new Error(`no active lease for job ${jobId}`);
  return token;
}

export const httpJobApi: JobApi = {
  clearActiveLease() {
    activeLease = null;
  },

  getActiveLeaseToken(jobId: string) {
    if (!activeLease || activeLease.jobId !== jobId) return null;
    return activeLease.token;
  },

  async claimJob(kinds?: JobKind[]) {
    const { job, leaseToken } = await apiFetch<{ job: JobRecord | null; leaseToken: string | null }>(
      "/api/jobs/claim",
      {
        method: "POST",
        body: JSON.stringify({ agentId: config.agentId, kinds, leaseSeconds: config.leaseSeconds }),
      }
    );
    if (!job || !leaseToken) {
      activeLease = null;
      return null;
    }
    activeLease = { jobId: job.id, token: leaseToken };
    return job;
  },

  async heartbeatJob(jobId: string) {
    await apiFetch(`/api/jobs/${jobId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({
        agentId: config.agentId,
        leaseToken: requireLeaseToken(jobId),
        leaseSeconds: config.leaseSeconds,
      }),
    });
  },

  async reportStage(jobId, name, status, attempt, extra) {
    await apiFetch(`/api/jobs/${jobId}/stages`, {
      method: "POST",
      body: JSON.stringify({
        agentId: config.agentId,
        leaseToken: requireLeaseToken(jobId),
        name,
        status,
        attempt,
        ...extra,
      }),
    });
  },

  async recordArtifact(jobId, stage, contentType, path, byteSize) {
    const { artifact } = await apiFetch<{ artifact: { id: string } }>(`/api/jobs/${jobId}/artifacts`, {
      method: "POST",
      body: JSON.stringify({
        agentId: config.agentId,
        leaseToken: requireLeaseToken(jobId),
        stage,
        contentType,
        path,
        byteSize,
      }),
    });
    return artifact;
  },

  async completeJob(jobId, output) {
    await apiFetch(`/api/jobs/${jobId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        agentId: config.agentId,
        leaseToken: requireLeaseToken(jobId),
        output,
      }),
    });
    activeLease = null;
  },

  async failJob(jobId, stage, error, terminal) {
    await apiFetch(`/api/jobs/${jobId}/fail`, {
      method: "POST",
      body: JSON.stringify({
        agentId: config.agentId,
        leaseToken: requireLeaseToken(jobId),
        stage,
        error,
        terminal,
      }),
    });
    if (terminal) activeLease = null;
  },

  async resolveProductRemote(input) {
    return apiFetch("/api/products/resolve", {
      method: "POST",
      body: JSON.stringify({ agentId: config.agentId, ...input }),
    });
  },

  async persistVariantSnapshot(listingId, input) {
    await apiFetch(`/api/listings/${listingId}/variant-snapshot`, {
      method: "POST",
      body: JSON.stringify({ agentId: config.agentId, ...input }),
    });
  },

  async persistPricePoint(listingId, input) {
    await apiFetch(`/api/listings/${listingId}/price-points`, {
      method: "POST",
      body: JSON.stringify({ agentId: config.agentId, ...input }),
    });
  },

  async markListingUnsupported(listingId, reason) {
    await apiFetch(`/api/runner/listings/${listingId}/unsupported`, {
      method: "POST",
      body: JSON.stringify({ agentId: config.agentId, reason }),
    });
  },

  async recordScheduledListingFailure(listingId, httpStatus) {
    await apiFetch(`/api/runner/listings/${listingId}/inactive`, {
      method: "POST",
      body: JSON.stringify({ agentId: config.agentId, httpStatus }),
    });
  },

  async setWatchDisplayTitle(watchId, displayTitle) {
    await apiFetch(`/api/runner/watches/${watchId}/display-title`, {
      method: "POST",
      body: JSON.stringify({ agentId: config.agentId, displayTitle }),
    });
  },

  async mergeProductSpecs(productId, specs) {
    await apiFetch(`/api/runner/products/${productId}/specs`, {
      method: "POST",
      body: JSON.stringify({ agentId: config.agentId, specs }),
    });
  },
};
