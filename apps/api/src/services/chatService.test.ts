import { afterEach, describe, expect, it } from "vitest";
import type { InferenceProvider } from "@framer/runner/inference/types.js";
import { createTestServer } from "../test/createTestServer.js";

function createMockProvider(
  handler: () => AsyncIterable<{
    type: string;
    delta?: string;
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
    promptTokens?: number;
    completionTokens?: number;
  }>
): InferenceProvider {
  return {
    kind: "ollama",
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
    async *chat() {
      for await (const event of handler()) {
        if (event.type === "text-delta") {
          yield { type: "text-delta", delta: event.delta ?? "" };
        } else if (event.type === "tool-call") {
          yield {
            type: "tool-call",
            id: event.id ?? "call_1",
            name: event.name ?? "listWatches",
            args: event.args ?? {},
          };
        } else if (event.type === "usage") {
          yield {
            type: "usage",
            promptTokens: event.promptTokens ?? 0,
            completionTokens: event.completionTokens ?? 0,
          };
        } else if (event.type === "done") {
          yield { type: "done" };
        }
      }
    },
  };
}

describe("chatService", () => {
  afterEach(async () => {
    const { resetChatProviderForTests } = await import("../services/chatService.js");
    resetChatProviderForTests();
  });

  it("streams assistant text and persists messages", async () => {
    const server = await createTestServer();
    const { createChatSession, sendChatMessage, setChatProviderForTests } = await import(
      "../services/chatService.js"
    );
    try {
      setChatProviderForTests(
        createMockProvider(() =>
          (async function* () {
            yield { type: "text-delta", delta: "Hello" };
            yield { type: "text-delta", delta: " there" };
            yield { type: "usage", promptTokens: 10, completionTokens: 4 };
            yield { type: "done" };
          })()
        )
      );

      const session = await createChatSession();
      const events: string[] = [];
      let assistantText = "";
      for await (const event of sendChatMessage(session.id, "Hi")) {
        events.push(event.event);
        if (event.event === "text-delta") assistantText += event.data.delta;
      }

      expect(assistantText).toBe("Hello there");
      expect(events).toContain("message-done");
      expect(events).toContain("done");

      const messagesRes = await fetch(`${server.baseUrl}/api/chat/sessions/${session.id}/messages`);
      const { messages } = await messagesRes.json();
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("Hello there");
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
      let callCount = 0;
      setChatProviderForTests(
        createMockProvider(() =>
          (async function* () {
            callCount += 1;
            if (callCount === 1) {
              yield {
                type: "tool-call",
                id: "call_watches",
                name: "listWatches",
                args: {},
              };
              yield { type: "done" };
              return;
            }
            yield { type: "text-delta", delta: "You have no watches." };
            yield { type: "done" };
          })()
        )
      );

      const session = await createChatSession();
      const events: Array<{ event: string; data: Record<string, unknown> }> = [];
      for await (const event of sendChatMessage(session.id, "What am I watching?")) {
        events.push({ event: event.event, data: event.data as Record<string, unknown> });
      }

      expect(events.some((event) => event.event === "tool-call")).toBe(true);
      const messagesRes = await fetch(`${server.baseUrl}/api/chat/sessions/${session.id}/messages`);
      const { messages } = await messagesRes.json();
      expect(messages.some((message: { role: string }) => message.role === "tool")).toBe(true);
    } finally {
      await server.close();
    }
  });
});
