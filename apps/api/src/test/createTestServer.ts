import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";

export async function createTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "framer-api-test-"));
  process.env.DATABASE_PATH = path.join(dataDir, "framer.db");
  process.env.RUNNER_ENABLED = "false";
  process.env.FRAMER_SWEEP_ENABLED = "false";
  vi.resetModules();

  const { createApp } = await import("../app.js");
  const { runMigrations } = await import("../db/migrate.js");
  const { pool } = await import("../db/pool.js");
  await runMigrations();

  const app = createApp();
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      await pool.end();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
