import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { config } from "../config.js";

const JSON_COLUMNS = new Set(["input", "output", "specs"]);

export type DbRow = Record<string, unknown>;

export interface QueryResult<T extends DbRow = DbRow> {
  rows: T[];
}

function convertPlaceholders(sql: string, params: unknown[] = []): { sql: string; params: unknown[] } {
  const order: number[] = [];
  const converted = sql
    .replace(/\$(\d+)::jsonb/g, (_, n) => {
      order.push(Number(n) - 1);
      return "?";
    })
    .replace(/\$(\d+)::text\[\]/g, (_, n) => {
      order.push(Number(n) - 1);
      return "?";
    })
    .replace(/\$(\d+)::uuid\[\]/g, (_, n) => {
      order.push(Number(n) - 1);
      return "?";
    })
    .replace(/\$(\d+)/g, (_, n) => {
      order.push(Number(n) - 1);
      return "?";
    });
  return {
    sql: converted.replace(/\bnow\(\)/gi, "datetime('now')"),
    params: order.length > 0 ? order.map((index) => params[index]) : params,
  };
}

function adaptSql(sql: string, params: unknown[] = []): { sql: string; params: unknown[] } {
  return convertPlaceholders(sql, params);
}

function parseRow(row: DbRow): DbRow {
  const out: DbRow = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (JSON_COLUMNS.has(key) && typeof value === "string") {
      try {
        out[key] = JSON.parse(value);
      } catch {
        // keep raw string
      }
    }
  }
  return out;
}

export function newId(): string {
  return randomUUID();
}

function createDatabase(): DatabaseSync {
  mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

export const sqlite = createDatabase();

export class DbClient {
  constructor(private readonly db: DatabaseSync = sqlite) {}

  query<T extends DbRow = DbRow>(sql: string, params: unknown[] = []): QueryResult<T> {
    const { sql: adapted, params: ordered } = adaptSql(sql, params);
    const stmt = this.db.prepare(adapted);
    const isSelect = /^\s*(select|with)/i.test(adapted);
    const hasReturning = /\breturning\b/i.test(adapted);

    if (isSelect || hasReturning) {
      const rows = stmt.all(...(ordered as SQLInputValue[])).map((row) => parseRow(row as DbRow)) as T[];
      return { rows };
    }

    stmt.run(...(ordered as SQLInputValue[]));
    return { rows: [] };
  }

  exec(sql: string): void {
    this.db.exec(adaptSql(sql).sql);
  }
}

export const dbClient = new DbClient();

/** pg-compatible async surface for existing call sites. */
export const pool = {
  query<T extends DbRow = DbRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return Promise.resolve(dbClient.query<T>(sql, params));
  },
  end(): Promise<void> {
    sqlite.close();
    return Promise.resolve();
  },
};

export type PoolClient = DbClient;

export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  sqlite.exec("BEGIN IMMEDIATE");
  const client = new DbClient(sqlite);
  try {
    const result = await fn(client);
    sqlite.exec("COMMIT");
    return result;
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

export function inClause(values: unknown[]): { sql: string; params: unknown[] } {
  if (values.length === 0) {
    return { sql: "select null where 0", params: [] };
  }
  return {
    sql: values.map(() => "?").join(", "),
    params: values,
  };
}
