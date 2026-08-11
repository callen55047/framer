import { afterEach, describe, expect, it } from "vitest";
import { createTestServer } from "../test/createTestServer.js";

const validWatchBody = {
  url: "https://example.com/bike/wheelset",
  itemKind: "component",
  category: "wheelset",
};

describe("POST /api/watches", () => {
  let server: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("rejects component watches without category", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: validWatchBody.url, itemKind: "component" }),
    });

    expect(res.status).toBe(400);
  });

  it("creates a watch with display title and item hints", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...validWatchBody,
        displayTitle: "OEM Rocky Mountain Instinct Price",
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();

    expect(created.watch).toMatchObject({
      displayTitle: "OEM Rocky Mountain Instinct Price",
      titleSource: "user",
    });
    expect(created.listing).toMatchObject({
      itemKind: "component",
      expectedCategory: "wheelset",
    });
  });

  it("creates a complete bike watch with optional size filters", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/bikes/instinct-c30",
        itemKind: "complete_bike",
        frameSize: "M",
        wheelSizeInches: "29",
        displayTitle: "Instinct C30",
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();

    expect(created.watch).toMatchObject({
      displayTitle: "Instinct C30",
      frameSize: "M",
      wheelSizeInches: "29",
      variantSelection: "all",
    });

    const listRes = await fetch(`${server.baseUrl}/api/watches`);
    const { watches } = await listRes.json();
    expect(watches[0]).toMatchObject({
      frameSize: "M",
      wheelSizeInches: "29",
      variantSelection: "all",
    });
  });

  it("keeps price history when updating optional size filters on the same URL", async () => {
    server = await createTestServer();
    const url = "https://example.com/bikes/instinct-c30";

    const first = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        itemKind: "complete_bike",
        frameSize: "M",
        wheelSizeInches: "29",
      }),
    });
    const firstCreated = await first.json();

    await fetch(`${server.baseUrl}/api/listings/${firstCreated.listing.id}/price-points`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer dev-agent-token",
      },
      body: JSON.stringify({
        agentId: "test-agent",
        productId: null,
        price: 4299.99,
        currency: "CAD",
        inStock: true,
        scrapedAt: new Date().toISOString(),
        title: "Instinct C30",
        watchId: firstCreated.watch.id,
      }),
    });

    const second = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        itemKind: "complete_bike",
        frameSize: "L",
        wheelSizeInches: "29",
      }),
    });
    expect(second.status).toBe(201);
    const secondCreated = await second.json();

    expect(secondCreated.watch.id).toBe(firstCreated.watch.id);
    expect(secondCreated.watch).toMatchObject({
      frameSize: "L",
      wheelSizeInches: "29",
    });

    const historyRes = await fetch(
      `${server.baseUrl}/api/watches/${firstCreated.watch.id}/price-points`
    );
    const { pricePoints } = await historyRes.json();
    expect(pricePoints).toHaveLength(1);
  });
});

describe("GET /api/watches", () => {
  let server: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("returns an empty watch list for a fresh database", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.baseUrl}/api/watches`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ watches: [] });
  });

  it("returns a created watch with its listing and latest refresh task", async () => {
    server = await createTestServer();

    const createRes = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validWatchBody),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const listRes = await fetch(`${server.baseUrl}/api/watches`);
    expect(listRes.status).toBe(200);
    const { watches } = await listRes.json();

    expect(watches).toHaveLength(1);
    expect(watches[0]).toMatchObject({
      id: created.watch.id,
      listingId: created.listing.id,
      titleSource: "auto",
      listing: {
        id: created.listing.id,
        url: validWatchBody.url,
        domain: "example.com",
        status: "active",
        consecutiveScheduledFailures: 0,
        itemKind: "component",
        expectedCategory: "wheelset",
      },
      latestTask: {
        id: created.task.id,
        status: "queued",
        error: null,
      },
    });
  });
});

describe("PATCH /api/watches/:id", () => {
  let server: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("updates display title and sets titleSource to user", async () => {
    server = await createTestServer();
    const createRes = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validWatchBody),
    });
    const created = await createRes.json();

    const patchRes = await fetch(`${server.baseUrl}/api/watches/${created.watch.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayTitle: "Local bike shop price" }),
    });
    expect(patchRes.status).toBe(200);
    const { watch } = await patchRes.json();
    expect(watch).toMatchObject({
      displayTitle: "Local bike shop price",
      titleSource: "user",
    });
  });
});

describe("DELETE /api/watches/:id", () => {
  let server: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("removes a watch from the list while keeping the listing and task history", async () => {
    server = await createTestServer();
    const url = "https://example.com/bike/frame";

    const createRes = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, itemKind: "component", category: "frame" }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const deleteRes = await fetch(`${server.baseUrl}/api/watches/${created.watch.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(204);

    const listRes = await fetch(`${server.baseUrl}/api/watches`);
    expect(listRes.status).toBe(200);
    const { watches } = await listRes.json();
    expect(watches).toEqual([]);

    const taskRes = await fetch(`${server.baseUrl}/api/tasks/${created.task.id}`);
    expect(taskRes.status).toBe(200);

    const deleteAgainRes = await fetch(`${server.baseUrl}/api/watches/${created.watch.id}`, {
      method: "DELETE",
    });
    expect(deleteAgainRes.status).toBe(404);
  });
});

describe("POST /api/runner/listings/:id/unsupported", () => {
  let server: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("marks a listing as unsupported", async () => {
    server = await createTestServer();
    const createRes = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validWatchBody),
    });
    const created = await createRes.json();

    const res = await fetch(`${server.baseUrl}/api/runner/listings/${created.listing.id}/unsupported`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer dev-agent-token",
      },
      body: JSON.stringify({ agentId: "test-agent", reason: "not_mtb_related" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.status).toBe("unsupported");

    const refreshRes = await fetch(`${server.baseUrl}/api/watches/${created.watch.id}/refresh`, {
      method: "POST",
    });
    expect(refreshRes.status).toBe(400);
  });
});

describe("POST /api/runner/listings/:id/inactive", () => {
  let server: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("marks a listing inactive on 404 and blocks refresh", async () => {
    server = await createTestServer();
    const createRes = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validWatchBody),
    });
    const created = await createRes.json();

    const res = await fetch(`${server.baseUrl}/api/runner/listings/${created.listing.id}/inactive`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer dev-agent-token",
      },
      body: JSON.stringify({ agentId: "test-agent", httpStatus: 404 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.status).toBe("inactive");
    expect(body.becameInactive).toBe(true);

    const refreshRes = await fetch(`${server.baseUrl}/api/watches/${created.watch.id}/refresh`, {
      method: "POST",
    });
    expect(refreshRes.status).toBe(400);
  });

  it("marks inactive after three consecutive scheduled failures", async () => {
    server = await createTestServer();
    const createRes = await fetch(`${server.baseUrl}/api/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validWatchBody),
    });
    const created = await createRes.json();

    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${server.baseUrl}/api/runner/listings/${created.listing.id}/inactive`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer dev-agent-token",
        },
        body: JSON.stringify({ agentId: "test-agent" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.becameInactive).toBe(false);
      expect(body.listing.status).toBe("active");
    }

    const finalRes = await fetch(`${server.baseUrl}/api/runner/listings/${created.listing.id}/inactive`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer dev-agent-token",
      },
      body: JSON.stringify({ agentId: "test-agent" }),
    });
    expect(finalRes.status).toBe(200);
    const finalBody = await finalRes.json();
    expect(finalBody.becameInactive).toBe(true);
    expect(finalBody.listing.status).toBe("inactive");
  });
});
