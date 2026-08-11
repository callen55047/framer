/**
 * Maps snake_case database rows to the camelCase shapes defined by
 * @framer/schema. SQLite returns numeric columns as numbers and timestamps
 * as ISO strings; both need normalizing before they match the Zod schemas.
 */

const SQLITE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

export function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (SQLITE_DATETIME_RE.test(value)) {
    return `${value.replace(" ", "T")}Z`;
  }
  return value;
}

export function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" ? value : Number(value);
}

export function toBoolean(value: boolean | number | null): boolean {
  if (typeof value === "boolean") return value;
  if (value === null) return false;
  return value !== 0;
}

export function mapProduct(row: any) {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    modelYear: row.model_year ?? undefined,
    category: row.category,
    gtin: row.gtin ?? undefined,
    specs: row.specs ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapListing(row: any) {
  return {
    id: row.id,
    productId: row.product_id,
    url: row.url,
    domain: row.domain,
    source: row.source,
    status: row.status,
    consecutiveScheduledFailures: toNumber(row.consecutive_scheduled_failures) ?? 0,
    itemKind: row.item_kind ?? "component",
    expectedCategory: row.expected_category ?? null,
    title: row.title,
    lastCheckedAt: toIso(row.last_checked_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapPricePoint(row: any) {
  return {
    id: row.id,
    listingId: row.listing_id,
    watchId: row.watch_id ?? null,
    price: toNumber(row.price),
    currency: row.currency,
    inStock: toBoolean(row.in_stock),
    scrapedAt: toIso(row.scraped_at),
  };
}

export function mapWatch(row: any) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    targetType: row.target_type,
    productId: row.product_id,
    listingId: row.listing_id,
    displayTitle: row.display_title ?? null,
    titleSource: row.title_source ?? "auto",
    frameSize: row.frame_size ?? null,
    wheelSizeInches: row.wheel_size_inches ?? null,
    variantSelection: row.variant_selection ?? "all",
    listingVariantId: row.listing_variant_id ?? null,
    createdAt: toIso(row.created_at),
  };
}

export function mapListingVariant(row: any) {
  let options: { name: string; value: string }[] = [];
  try {
    const parsed = JSON.parse(row.option_labels ?? "[]");
    if (Array.isArray(parsed)) options = parsed;
  } catch {
    options = [];
  }
  return {
    id: row.id,
    listingId: row.listing_id,
    providerId: row.provider_id,
    label: row.label,
    options,
    frameSize: row.frame_size ?? null,
    wheelSizeInches: row.wheel_size_inches ?? null,
    price: toNumber(row.price),
    currency: row.currency,
    inStock: toBoolean(row.in_stock),
    firstSeenAt: toIso(row.first_seen_at),
    lastSeenAt: toIso(row.last_seen_at),
  };
}

export function mapTask(row: any) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    label: row.label,
    status: row.status,
    origin: row.origin,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapJob(row: any) {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    status: row.status,
    attempt: row.attempt,
    input: row.input,
    output: row.output,
    error: row.error,
    dependsOnJobId: row.depends_on_job_id ?? null,
    leasedBy: row.leased_by,
    leaseExpiresAt: toIso(row.lease_expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapStage(row: any) {
  return {
    id: row.id,
    jobId: row.job_id,
    name: row.name,
    status: row.status,
    attempt: row.attempt,
    artifactId: row.artifact_id,
    error: row.error,
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
  };
}

export function mapArtifact(row: any) {
  return {
    id: row.id,
    jobId: row.job_id,
    stage: row.stage,
    contentType: row.content_type,
    path: row.path,
    byteSize: row.byte_size,
    createdAt: toIso(row.created_at),
  };
}
