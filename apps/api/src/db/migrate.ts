import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbClient } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "../..");
const migrationsDir = path.join(apiRoot, "src/db/migrations");

export async function runMigrations(): Promise<void> {
  dbClient.exec(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at text not null default (datetime('now'))
    )
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows: applied } = dbClient.query<{ name: string }>("select name from schema_migrations");
  const appliedNames = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`apply ${file}`);
    dbClient.exec("BEGIN IMMEDIATE");
    try {
      dbClient.exec(sql);
      dbClient.query("insert into schema_migrations (name) values ($1)", [file]);
      dbClient.exec("COMMIT");
    } catch (err) {
      dbClient.exec("ROLLBACK");
      throw err;
    }
  }

  console.log("migrations up to date");
}

async function main() {
  await runMigrations();
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("/migrate.ts") || entry.endsWith("/migrate.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
