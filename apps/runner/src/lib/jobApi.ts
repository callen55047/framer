import type { JobKind, JobRecord, StageName, StageStatus } from "@framer/schema";

export interface JobApi {
  claimJob(kinds?: JobKind[]): Promise<JobRecord | null>;
  heartbeatJob(jobId: string): Promise<void>;
  reportStage(
    jobId: string,
    name: StageName,
    status: StageStatus,
    attempt: number,
    extra?: { artifactId?: string | null; error?: string | null }
  ): Promise<void>;
  recordArtifact(
    jobId: string,
    stage: StageName,
    contentType: string,
    path: string,
    byteSize: number
  ): Promise<{ id: string }>;
  completeJob(jobId: string, output: Record<string, unknown>): Promise<void>;
  failJob(jobId: string, stage: StageName | undefined, error: string, terminal: boolean): Promise<void>;
  resolveProductRemote(input: {
    brand: string;
    modelGuess: string;
    modelYear: number | null;
    gtin: string | null;
    category: string;
  }): Promise<{ productId: string; grade: "high" | "review" | "new" }>;
  persistVariantSnapshot(
    listingId: string,
    input: {
      productId: string | null;
      title: string;
      scrapedAt: string;
      variants: Array<{
        providerId: string;
        label: string;
        options: Array<{ name: string; value: string }>;
        frameSize?: string | null;
        wheelSizeInches?: string | null;
        price: number;
        currency: string;
        inStock: boolean;
      }>;
      watchIds?: string[];
      discoveryFilter?: { frameSize?: string; wheelSizeInches?: string } | null;
    }
  ): Promise<void>;
  persistPricePoint(
    listingId: string,
    input: {
      watchId?: string | null;
      productId: string | null;
      price: number;
      currency: string;
      inStock: boolean;
      scrapedAt: string;
      title: string;
    }
  ): Promise<void>;
  markListingUnsupported(listingId: string, reason: string): Promise<void>;
  recordScheduledListingFailure(listingId: string, httpStatus?: number): Promise<void>;
  setWatchDisplayTitle(watchId: string, displayTitle: string): Promise<void>;
  clearActiveLease(): void;
  getActiveLeaseToken(jobId: string): string | null;
}

let jobApi: JobApi | null = null;

export function configureJobApi(api: JobApi): void {
  jobApi = api;
}

export function getJobApi(): JobApi {
  if (!jobApi) {
    throw new Error("Job API not configured. Call configureJobApi() before using runner functions.");
  }
  return jobApi;
}

export function clearActiveLease(): void {
  getJobApi().clearActiveLease();
}

export function getActiveLeaseToken(jobId: string): string | null {
  return getJobApi().getActiveLeaseToken(jobId);
}

export async function claimJob(kinds?: JobKind[]): Promise<JobRecord | null> {
  return getJobApi().claimJob(kinds);
}

export async function heartbeatJob(jobId: string): Promise<void> {
  return getJobApi().heartbeatJob(jobId);
}

export async function reportStage(
  jobId: string,
  name: StageName,
  status: StageStatus,
  attempt: number,
  extra?: { artifactId?: string | null; error?: string | null }
): Promise<void> {
  return getJobApi().reportStage(jobId, name, status, attempt, extra);
}

export async function recordArtifact(
  jobId: string,
  stage: StageName,
  contentType: string,
  path: string,
  byteSize: number
): Promise<{ id: string }> {
  return getJobApi().recordArtifact(jobId, stage, contentType, path, byteSize);
}

export async function completeJob(jobId: string, output: Record<string, unknown>): Promise<void> {
  return getJobApi().completeJob(jobId, output);
}

export async function failJob(
  jobId: string,
  stage: StageName | undefined,
  error: string,
  terminal: boolean
): Promise<void> {
  return getJobApi().failJob(jobId, stage, error, terminal);
}

export async function resolveProductRemote(input: {
  brand: string;
  modelGuess: string;
  modelYear: number | null;
  gtin: string | null;
  category: string;
}): Promise<{ productId: string; grade: "high" | "review" | "new" }> {
  return getJobApi().resolveProductRemote(input);
}

export async function persistVariantSnapshot(
  listingId: string,
  input: {
    productId: string | null;
    title: string;
    scrapedAt: string;
    variants: Array<{
      providerId: string;
      label: string;
      options: Array<{ name: string; value: string }>;
      frameSize?: string | null;
      wheelSizeInches?: string | null;
      price: number;
      currency: string;
      inStock: boolean;
    }>;
    watchIds?: string[];
    discoveryFilter?: { frameSize?: string; wheelSizeInches?: string } | null;
  }
): Promise<void> {
  return getJobApi().persistVariantSnapshot(listingId, input);
}

export async function persistPricePoint(
  listingId: string,
  input: {
    watchId?: string | null;
    productId: string | null;
    price: number;
    currency: string;
    inStock: boolean;
    scrapedAt: string;
    title: string;
  }
): Promise<void> {
  return getJobApi().persistPricePoint(listingId, input);
}

export async function markListingUnsupportedRemote(listingId: string, reason: string): Promise<void> {
  return getJobApi().markListingUnsupported(listingId, reason);
}

export async function recordScheduledListingFailureRemote(
  listingId: string,
  httpStatus?: number
): Promise<void> {
  return getJobApi().recordScheduledListingFailure(listingId, httpStatus);
}

export async function setWatchDisplayTitleRemote(watchId: string, displayTitle: string): Promise<void> {
  return getJobApi().setWatchDisplayTitle(watchId, displayTitle);
}
