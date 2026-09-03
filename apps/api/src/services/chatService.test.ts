import { afterEach, describe, expect, it } from "vitest";
import type {
  ChatMessage as ProviderChatMessage,
  ChatStreamEvent,
  ChatTool,
  InferenceProvider,
} from "@framer/runner/inference/types.js";
import { createTestServer } from "../test/createTestServer.js";

type MockEvent = ChatStreamEvent;

interface CapturedCall {
  messages: ProviderChatMessage[];
  tools: ChatTool[];
}

/**
 * Builds a provider whose chat() replays scripted events. `script` receives
 * the 1-based call number plus the messages/tools the service passed in, so
 * tests can branch per call and assert on what the model would have seen.
 */
function createMockProvider(
  script: (callNumber: number, call: CapturedCall) => MockEvent[]
): { provider: InferenceProvider; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const provider: InferenceProvider = {
    kind: "lmstudio",
    extractListing: async () => {
      throw new Error("not implemented");
    },
    classifyListingRelevance: async () => {
      throw new Error("not implemented");
    },
    generateWatchTitle: async () => "title",
    generateSessionTitle: async (userMessage) => userMessage.slice(0, 30),
    summarizeChatSession: async (messages) =>
      messages.map((message) => message.content).join(" ").slice(0, 200) || "Empty session.",
    extractProductSpecs: async () => ({}),
    synthesizeResearchAnswer: async (_question, excerpts) => excerpts.slice(0, 200),
    async *chat(messages, tools) {
      const call = { messages: structuredClone(messages), tools };
      calls.push(call);
      for (const event of script(calls.length, call)) {
        yield event;
      }
    },
  };
  return { provider, calls };
}

const text = (delta: string): MockEvent => ({ type: "text-delta", delta });
const toolCall = (name: string, args: Record<string, unknown> = {}, id = "call_0"): MockEvent => ({
  type: "tool-call",
  id,
  name,
  args,
});
const done: MockEvent = { type: "done" };

async function collect(events: AsyncIterable<{ event: string; data: unknown }>) {
  const out: Array<{ event: string; data: Record<string, unknown> }> = [];
  for await (const event of events) {
    out.push({ event: event.event, data: event.data as Record<string, unknown> });
  }
  return out;
}

async function loadMessages(baseUrl: string, sessionId: string) {
  const res = await fetch(`${baseUrl}/api/chat/sessions/${sessionId}/messages`);
  const { messages } = (await res.json()) as {
    messages: Array<{
      id: string;
      role: string;
      content: string;
      toolName: string | null;
      toolArgs: Record<string, unknown> | null;
      toolResult: unknown;
      toolCalls: Array<{ id: string; name: string }> | null;
    }>;
  };
  return messages;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("chatService", () => {
  afterEach(async () => {
    delete process.env.CHAT_TOOL_RESULT_MAX_CHARS;
    const { resetChatProviderForTests } = await import("../services/chatService.js");
    resetChatProviderForTests();
  });

  it("streams assistant text and persists messages", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      const { provider } = createMockProvider(() => [
        text("Hello"),
        text(" there"),
        { type: "usage", promptTokens: 10, completionTokens: 4 },
        done,
      ]);
      setChatProviderForTests(provider);

      const session = await createChatSession();
      const events = await collect(sendChatMessage(session.id, "Hi"));
      const assistantText = events
        .filter((event) => event.event === "text-delta")
        .map((event) => String(event.data.delta))
        .join("");

      expect(assistantText).toBe("Hello there");
      expect(events.map((event) => event.event)).toContain("done");

      const messages = await loadMessages(server.baseUrl, session.id);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.role).toBe("assistant");
      expect(messages[1]!.content).toBe("Hello there");
    } finally {
      await server.close();
    }
  });

  it("executes tool calls and emits tool-call events", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      const { provider } = createMockProvider((callNumber) =>
        callNumber === 1 ? [toolCall("listWatches", {}, "call_watches"), done] : [text("You have no watches."), done]
      );
      setChatProviderForTests(provider);

      const session = await createChatSession();
      const events = await collect(sendChatMessage(session.id, "What am I watching?"));

      expect(events.some((event) => event.event === "tool-call")).toBe(true);
      const messages = await loadMessages(server.baseUrl, session.id);
      expect(messages.some((message) => message.role === "tool")).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("remaps provider tool-call ids so call_0 can repeat across iterations and turns", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      // Every turn: first call -> two tools both named call_0/call_1, second call -> tool call_0 again, third -> text.
      let perTurnCall = 0;
      const { provider } = createMockProvider(() => {
        perTurnCall += 1;
        if (perTurnCall === 1) return [toolCall("listWatches", {}, "call_0"), toolCall("listTasks", {}, "call_1"), done];
        if (perTurnCall === 2) return [toolCall("listWatches", {}, "call_0"), done];
        perTurnCall = 0;
        return [text("Nothing. Riveting."), done];
      });
      setChatProviderForTests(provider);

      const session = await createChatSession();
      const first = await collect(sendChatMessage(session.id, "What am I watching?"));
      expect(first.some((event) => event.event === "error")).toBe(false);
      const second = await collect(sendChatMessage(session.id, "And now?"));
      expect(second.some((event) => event.event === "error")).toBe(false);

      const messages = await loadMessages(server.baseUrl, session.id);
      const ids = messages.map((message) => message.id);
      expect(new Set(ids).size).toBe(ids.length);
      const toolRows = messages.filter((message) => message.role === "tool");
      expect(toolRows).toHaveLength(6);
      for (const row of toolRows) {
        expect(row.id).toMatch(UUID_RE);
      }
    } finally {
      await server.close();
    }
  });

  it("persists assistant tool_calls and replays them paired with tool results on later turns", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      const { provider, calls } = createMockProvider((callNumber) => {
        if (callNumber === 1) return [text("Ugh, hold on."), toolCall("listWatches"), done];
        if (callNumber === 2) return [text("No watches."), done];
        return [text("Still none."), done];
      });
      setChatProviderForTests(provider);

      const session = await createChatSession();
      await collect(sendChatMessage(session.id, "What am I watching?"));
      await collect(sendChatMessage(session.id, "Sure?"));

      const messages = await loadMessages(server.baseUrl, session.id);
      const assistantWithCalls = messages.find((message) => message.role === "assistant" && message.toolCalls);
      expect(assistantWithCalls).toBeDefined();
      expect(assistantWithCalls!.toolCalls![0]!.name).toBe("listWatches");
      const toolRow = messages.find((message) => message.role === "tool");
      expect(assistantWithCalls!.toolCalls![0]!.id).toBe(toolRow!.id);

      // Third provider call is the first call of turn 2: it sees the replayed history.
      const replayed = calls[2]!.messages;
      const assistantIndex = replayed.findIndex((message) => message.role === "assistant" && message.toolCalls?.length);
      expect(assistantIndex).toBeGreaterThan(0);
      const following = replayed[assistantIndex + 1]!;
      expect(following.role).toBe("tool");
      expect(following.toolCallId).toBe(replayed[assistantIndex]!.toolCalls![0]!.id);
      expect(replayed[assistantIndex]!.content).toBe("Ugh, hold on.");
    } finally {
      await server.close();
    }
  });

  it("sanitizeHistory drops orphaned tool messages and unmatched tool calls", async () => {
    const { sanitizeHistory } = await import("../services/chatService.js");
    const cleaned = sanitizeHistory([
      { role: "user", content: "hi" },
      { role: "tool", content: "{}", toolCallId: "orphan" },
      { role: "assistant", content: "", toolCalls: [{ id: "a", name: "listWatches", args: {} }, { id: "b", name: "listTasks", args: {} }] },
      { role: "tool", content: "[]", toolCallId: "a" },
      { role: "tool", content: "[]", toolCallId: "a" },
      { role: "assistant", content: "" },
      { role: "assistant", content: "done" },
    ]);
    expect(cleaned).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "", toolCalls: [{ id: "a", name: "listWatches", args: {} }] },
      { role: "tool", content: "[]", toolCallId: "a" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("ends the turn with a clarification and emits option chips", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      const { provider, calls } = createMockProvider(() => [
        toolCall("askClarifyingQuestion", {
          question: "Which size, since you didn't bother saying?",
          options: [" M ", "L", "l", "XL"],
        }),
        done,
      ]);
      setChatProviderForTests(provider);

      const session = await createChatSession();
      const events = await collect(sendChatMessage(session.id, "What stem fits my bike?"));
      const names = events.map((event) => event.event);
      expect(names).toEqual(["message-done", "clarification", "message-done", "done"]);
      const clarification = events.find((event) => event.event === "clarification")!;
      expect(clarification.data.question).toBe("Which size, since you didn't bother saying?");
      expect(clarification.data.options).toEqual(["M", "L", "XL"]);
      expect(clarification.data.allowFreeText).toBe(true);
      expect(calls).toHaveLength(1);

      const messages = await loadMessages(server.baseUrl, session.id);
      expect(messages).toHaveLength(2);
      const asked = messages[1]!;
      expect(asked.role).toBe("assistant");
      expect(asked.toolName).toBe("askClarifyingQuestion");
      expect(asked.content).toBe("Which size, since you didn't bother saying?");
      expect(asked.toolArgs?.options).toEqual(["M", "L", "XL"]);
      expect(asked.toolCalls ?? null).toBeNull();
    } finally {
      await server.close();
    }
  });

  it("runs lookups before a clarification and still stops after one provider call", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      const { provider, calls } = createMockProvider(() => [
        toolCall("listWatches", {}, "call_0"),
        toolCall("askClarifyingQuestion", { question: "Which one?", options: ["A", "B"] }, "call_1"),
        done,
      ]);
      setChatProviderForTests(provider);

      const session = await createChatSession();
      const events = await collect(sendChatMessage(session.id, "Cheapest?"));
      expect(events.some((event) => event.event === "tool-call")).toBe(true);
      expect(events.some((event) => event.event === "clarification")).toBe(true);
      expect(calls).toHaveLength(1);

      const messages = await loadMessages(server.baseUrl, session.id);
      const withCalls = messages.find((message) => message.role === "assistant" && message.toolCalls);
      expect(withCalls!.toolCalls!.map((call) => call.name)).toEqual(["listWatches"]);
      expect(messages.filter((message) => message.role === "tool")).toHaveLength(1);
      expect(messages.at(-1)!.toolName).toBe("askClarifyingQuestion");
    } finally {
      await server.close();
    }
  });

  it("treats an invalid clarification as a normal failed tool call", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      const { provider, calls } = createMockProvider((callNumber) =>
        callNumber === 1 ? [toolCall("askClarifyingQuestion", { options: ["A"] }), done] : [text("Fine."), done]
      );
      setChatProviderForTests(provider);

      const session = await createChatSession();
      const events = await collect(sendChatMessage(session.id, "hm"));
      expect(events.some((event) => event.event === "clarification")).toBe(false);
      expect(calls).toHaveLength(2);
      const toolMessage = calls[1]!.messages.find((message) => message.role === "tool")!;
      expect(toolMessage.content).toMatch(/requires a non-empty question/);
    } finally {
      await server.close();
    }
  });

  it("truncates large tool results for the model but persists them whole", async () => {
    process.env.CHAT_TOOL_RESULT_MAX_CHARS = "300";
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests, truncateToolResultForModel } =
      await import("../services/chatService.js");
    const { pool } = await import("../db/pool.js");
    try {
      expect(truncateToolResultForModel("abc", 10)).toBe("abc");
      expect(truncateToolResultForModel("x".repeat(20), 5)).toBe(`xxxxx\n…[truncated 15 chars; narrow the query or use limit/since]`);

      const { provider, calls } = createMockProvider((callNumber) =>
        callNumber === 1 ? [toolCall("getSessionSummary"), done] : [text("Long story."), done]
      );
      setChatProviderForTests(provider);

      const session = await createChatSession();
      await pool.query("update chat_sessions set summary = $2, summary_updated_at = datetime('now') where id = $1", [
        session.id,
        "s".repeat(2000),
      ]);
      await collect(sendChatMessage(session.id, "Summarize?"));

      const toolMessage = calls[1]!.messages.find((message) => message.role === "tool")!;
      expect(toolMessage.content.length).toBeLessThan(400);
      expect(toolMessage.content).toMatch(/…\[truncated \d+ chars/);

      const messages = await loadMessages(server.baseUrl, session.id);
      const toolRow = messages.find((message) => message.role === "tool")!;
      expect((toolRow.toolResult as { summary: string }).summary).toHaveLength(2000);
    } finally {
      await server.close();
    }
  });

  it("forces a final answer when the tool budget is exhausted", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      const { provider, calls } = createMockProvider((_callNumber, call) =>
        call.tools.length === 0 ? [text("Fine, here is what I have."), done] : [toolCall("listWatches"), done]
      );
      setChatProviderForTests(provider);

      const session = await createChatSession();
      const events = await collect(sendChatMessage(session.id, "Keep looking"));
      expect(events.some((event) => event.event === "error")).toBe(false);

      expect(calls).toHaveLength(11);
      const last = calls.at(-1)!;
      expect(last.tools).toEqual([]);
      expect(last.messages.at(-1)!.role).toBe("system");
      expect(last.messages.at(-1)!.content).toMatch(/Tool budget exhausted/);

      const messages = await loadMessages(server.baseUrl, session.id);
      expect(messages.at(-1)!.role).toBe("assistant");
      expect(messages.at(-1)!.content).toBe("Fine, here is what I have.");
      // The nudge is never persisted.
      expect(messages.some((message) => message.content.includes("Tool budget exhausted"))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("falls back to a canned reply when the model returns nothing at all", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      const { provider, calls } = createMockProvider(() => [done]);
      setChatProviderForTests(provider);

      const session = await createChatSession();
      const events = await collect(sendChatMessage(session.id, "..."));
      expect(calls).toHaveLength(2);
      expect(events.some((event) => event.event === "error")).toBe(false);

      const messages = await loadMessages(server.baseUrl, session.id);
      expect(messages.at(-1)!.role).toBe("assistant");
      expect(messages.at(-1)!.content).toMatch(/Burned through every lookup/);
    } finally {
      await server.close();
    }
  });
});
