import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

/**
 * Guards Runner-only endpoints (job claim/lifecycle, product resolution,
 * price-point writes) with a static shared secret. The frontend never sends
 * this header. Deliberately simple for a single local Runner; the seam for
 * per-agent tokens is `config.agentToken` becoming a lookup table.
 */
export function requireAgentToken(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token || token !== config.agentToken) {
    res.status(401).json({ error: "invalid or missing agent token" });
    return;
  }
  next();
}
