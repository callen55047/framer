/**
 * One source of truth for how Tool Calls are described in the Assistant UI.
 * `active` is shown while the call is running; `done` is the collapsed chip
 * in the transcript. Keep in sync with CHAT_TOOLS in apps/api/src/lib/chatTools.ts.
 */
export const CHAT_TOOL_LABELS: Record<string, { active: string; done: string }> = {
  listWatches: { active: "Checking your watches…", done: "Checked your watches" },
  listTasks: { active: "Checking tasks…", done: "Checked tasks" },
  searchProducts: { active: "Searching the catalog…", done: "Searched the catalog" },
  getListing: { active: "Looking up listing…", done: "Looked up listing" },
  getProductListings: { active: "Comparing retailer prices…", done: "Compared retailer prices" },
  getPriceHistory: { active: "Pulling price history…", done: "Pulled price history" },
  listRetailers: { active: "Listing retailers…", done: "Listed retailers" },
  searchReference: { active: "Searching reference sites…", done: "Searched reference sites" },
  fetchReferencePage: { active: "Fetching reference page…", done: "Fetched reference page" },
  checkCompatibility: { active: "Checking compatibility…", done: "Checked compatibility" },
  findCompatibleProducts: { active: "Finding compatible parts…", done: "Found compatible parts" },
  enqueueResearch: { active: "Queueing background research…", done: "Queued background research" },
  listSessionSummaries: { active: "Listing past sessions…", done: "Listed past sessions" },
  getSessionSummary: { active: "Loading session summary…", done: "Loaded session summary" },
  getHandbookEntry: { active: "Loading handbook entry…", done: "Loaded handbook entry" },
  askClarifyingQuestion: { active: "Working out what to ask…", done: "Asked a question" },
};

export function toolActivityLabel(toolName: string): string {
  return CHAT_TOOL_LABELS[toolName]?.active ?? `Using ${toolName}…`;
}

export function toolDoneLabel(toolName: string | null): string {
  if (!toolName) return "Used a tool";
  return CHAT_TOOL_LABELS[toolName]?.done ?? `Used ${toolName}`;
}
