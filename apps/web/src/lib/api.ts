export interface WatchListing {
  id: string;
  productId: string | null;
  url: string;
  domain: string;
  source: "feed" | "scrape";
  status: "active" | "inactive" | "unsupported";
  consecutiveScheduledFailures: number;
  itemKind: "component" | "complete_bike";
  expectedCategory: string | null;
  title: string | null;
  lastCheckedAt: string | null;
  product: { brand: string; model: string; modelYear: number | null } | null;
}

export interface WatchLatestPrice {
  price: number;
  currency: string;
  inStock: boolean;
  scrapedAt: string;
}

export interface WatchVariantSummary {
  variantSelection: "all" | "specific";
  pinnedVariantId: string | null;
  pinnedLabel: string | null;
  lowestInStockPrice: number | null;
  highestInStockPrice: number | null;
  availableCount: number;
  totalCount: number;
  currency: string | null;
  price: number | null;
  inStock: boolean;
  scrapedAt: string | null;
}

export interface ListingVariant {
  id: string;
  listingId: string;
  providerId: string;
  label: string;
  options: { name: string; value: string }[];
  frameSize: "XS" | "S" | "M" | "L" | "XL" | "XXL" | null;
  wheelSizeInches: "26" | "27.5" | "29" | null;
  price: number;
  currency: string;
  inStock: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Watch {
  id: string;
  ownerId: string;
  targetType: "product" | "listing";
  productId: string | null;
  listingId: string | null;
  displayTitle: string | null;
  titleSource: "user" | "auto";
  frameSize: "XS" | "S" | "M" | "L" | "XL" | "XXL" | null;
  wheelSizeInches: "26" | "27.5" | "29" | null;
  variantSelection: "all" | "specific";
  listingVariantId: string | null;
  createdAt: string;
  listing: WatchListing | null;
  latestPrice: WatchLatestPrice | null;
  variantSummary: WatchVariantSummary | null;
  latestTask: { id: string; status: string; error: string | null } | null;
}

export interface CreateWatchInput {
  url: string;
  displayTitle?: string;
  itemKind?: "component" | "complete_bike";
  category?: "frame" | "fork" | "wheelset" | "drivetrain" | "brakes" | "cockpit" | "tires" | "other";
  frameSize?: "XS" | "S" | "M" | "L" | "XL" | "XXL";
  wheelSizeInches?: "26" | "27.5" | "29";
}

export interface PricePoint {
  id: string;
  listingId: string;
  price: number;
  currency: string;
  inStock: boolean;
  scrapedAt: string;
}

export interface Task {
  id: string;
  ownerId: string;
  kind: string;
  label: string;
  status: "queued" | "active" | "succeeded" | "partial" | "failed";
  origin: "user" | "sweep";
  createdAt: string;
  updatedAt: string;
  jobCounts: { queued: number; leased: number; succeeded: number; failed: number; cancelled: number };
}

export interface Stage {
  id: string;
  jobId: string;
  name: "fetch" | "validate" | "extract" | "resolve" | "persist";
  status: "pending" | "running" | "succeeded" | "failed";
  attempt: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Job {
  id: string;
  taskId: string;
  kind: string;
  status: "queued" | "leased" | "succeeded" | "failed" | "cancelled";
  attempt: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  dependsOnJobId?: string | null;
  createdAt: string;
  updatedAt: string;
  stages: Stage[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listWatches: () => request<{ watches: Watch[] }>("/watches"),
  createWatch: (input: CreateWatchInput) =>
    request<{ watch: Watch; listing: WatchListing; task: Task | null }>("/watches", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateWatch: (watchId: string, displayTitle: string) =>
    request<{ watch: Watch }>(`/watches/${watchId}`, {
      method: "PATCH",
      body: JSON.stringify({ displayTitle }),
    }),
  updateWatchVariant: (
    watchId: string,
    input: { variantSelection: "all" | "specific"; listingVariantId?: string }
  ) =>
    request<{ watch: Watch; variantSummary: WatchVariantSummary }>(`/watches/${watchId}/variant`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  refreshWatch: (watchId: string) => request<{ task: Task }>(`/watches/${watchId}/refresh`, { method: "POST" }),
  deleteWatch: (watchId: string) => request<void>(`/watches/${watchId}`, { method: "DELETE" }),
  listWatchVariants: (watchId: string) => request<{ variants: ListingVariant[] }>(`/watches/${watchId}/variants`),
  listPricePoints: (listingId: string) => request<{ pricePoints: PricePoint[] }>(`/listings/${listingId}/price-points`),
  listWatchPricePoints: (watchId: string) =>
    request<{ pricePoints: PricePoint[] }>(`/watches/${watchId}/price-points`),
  listTasks: (includeAll = false) => request<{ tasks: Task[] }>(`/tasks${includeAll ? "?origin=all" : ""}`),
  getTask: (taskId: string) => request<{ task: Task; jobs: Job[] }>(`/tasks/${taskId}`),
  createAcknowledgeProof: (steps = 1) =>
    request<{ task: Task; jobs: Job[] }>(`/tasks/acknowledge-proof?steps=${steps}`, { method: "POST" }),
};
