import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { config } from "./config.js";
import { jobsRouter } from "./routes/jobs.js";
import { productsRouter } from "./routes/products.js";
import { listingsRouter } from "./routes/listings.js";
import { watchesRouter } from "./routes/watches.js";
import { tasksRouter } from "./routes/tasks.js";
import { runnerListingsRouter } from "./routes/runnerListings.js";
import { runnerWatchesRouter } from "./routes/runnerWatches.js";
import { chatRouter } from "./routes/chat.js";
import { runnerChatRouter } from "./routes/runnerChat.js";
import { runnerProductsRouter } from "./routes/runnerProducts.js";
import { handbookRouter } from "./routes/handbook.js";

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/jobs", jobsRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api/watches", watchesRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/runner/listings", runnerListingsRouter);
  app.use("/api/runner/watches", runnerWatchesRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/runner/chat", runnerChatRouter);
  app.use("/api/runner/products", runnerProductsRouter);
  app.use("/api/handbook", handbookRouter);

  const webDist = config.webDistPath;
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
