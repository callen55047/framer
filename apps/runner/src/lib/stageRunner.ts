import { MAX_STAGE_ATTEMPTS, type StageName } from "@framer/schema";
import { failJob, reportStage } from "./apiClient.js";
import { UnsupportedListingError } from "../stages/validateStage.js";
import { FetchHttpError } from "../stages/fetchStage.js";

export class StageFailedError extends Error {
  constructor(
    public readonly stage: StageName,
    message: string,
    public readonly fetchStatus?: number
  ) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one Stage of a Job's pipeline with retry scoped to that Stage only —
 * a model-output failure never re-triggers a network fetch, and vice versa.
 * See CONTEXT.md#Stage. Retries happen in-process here; the API's
 * /jobs/:id/stages endpoint is reporting-only (see docs/ARCHITECTURE.md).
 */
export async function runStage<T>(
  jobId: string,
  name: StageName,
  fn: (attempt: number) => Promise<T>,
  getArtifactId?: (result: T) => string | null | undefined
): Promise<T> {
  await reportStage(jobId, name, "running", 1);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_STAGE_ATTEMPTS; attempt++) {
    try {
      const result = await fn(attempt);
      await reportStage(jobId, name, "succeeded", attempt, { artifactId: getArtifactId?.(result) ?? null });
      return result;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const fetchStatus = err instanceof FetchHttpError ? err.status : undefined;
      if (err instanceof UnsupportedListingError) {
        console.warn(`[job ${jobId}] stage=${name} unsupported listing: ${message}`);
        await reportStage(jobId, name, "failed", attempt, { error: message });
        await failJob(jobId, name, message, true);
        throw new StageFailedError(name, message, fetchStatus);
      }
      const isFinalAttempt = attempt === MAX_STAGE_ATTEMPTS;
      console.warn(`[job ${jobId}] stage=${name} attempt=${attempt} failed: ${message}`);
      if (!isFinalAttempt) {
        await failJob(jobId, name, message, false);
        await sleep(500 * attempt); // small backoff between in-process retries
        continue;
      }
      await reportStage(jobId, name, "failed", attempt, { error: message });
      await failJob(jobId, name, message, true);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  const fetchStatus = lastError instanceof FetchHttpError ? lastError.status : undefined;
  throw new StageFailedError(name, `stage "${name}" failed after ${MAX_STAGE_ATTEMPTS} attempts: ${message}`, fetchStatus);
}
