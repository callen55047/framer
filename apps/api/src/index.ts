import { existsSync } from "node:fs";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { runMigrations } from "./db/migrate.js";
import { startIntegratedRunner } from "./runner/startRunner.js";

const app = createApp();
const webDist = config.webDistPath;
if (!existsSync(webDist)) {
  console.warn(`[web] static assets not found at ${webDist}; run "npm run build -w @framer/web" for production UI`);
}

async function main() {
  await runMigrations();
  startIntegratedRunner();
  app.listen(config.port, () => {
    console.log(`framer listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
