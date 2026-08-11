import { Router } from "express";
import { requireAgentToken } from "../lib/auth.js";
import { mapArtifact, mapJob, mapStage } from "../lib/mappers.js";
import {
  claimJob,
  completeJobForAgent,
  failJobForAgent,
  heartbeatJob,
  isOutputValidationError,
  parseClaimRequest,
  parseCompleteRequest,
  parseFailRequest,
  parseHeartbeatRequest,
  parseStageReport,
  recordJobArtifact,
  reportJobStage,
} from "../services/jobsService.js";

export const jobsRouter = Router();
jobsRouter.use(requireAgentToken);

jobsRouter.post("/claim", async (req, res) => {
  const parsed = parseClaimRequest(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { agentId, kinds, leaseSeconds } = parsed.data;

  const result = await claimJob(agentId, kinds && kinds.length > 0 ? kinds : null, leaseSeconds);
  if (!result) {
    return res.json({ job: null, leaseToken: null });
  }

  res.json({ job: mapJob(result.job), leaseToken: result.leaseToken });
});

jobsRouter.post("/:id/heartbeat", async (req, res) => {
  const parsed = parseHeartbeatRequest(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const ok = await heartbeatJob(
    req.params.id,
    parsed.data.agentId,
    parsed.data.leaseToken,
    parsed.data.leaseSeconds
  );

  if (!ok) return res.status(404).json({ error: "job not found or lease invalid" });
  res.json({ ok: true });
});

jobsRouter.post("/:id/stages", async (req, res) => {
  const parsed = parseStageReport(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, status, attempt, artifactId, error } = parsed.data;

  const stage = await reportJobStage(
    req.params.id,
    { agentId: parsed.data.agentId, leaseToken: parsed.data.leaseToken },
    { name, status, attempt, artifactId, error }
  );
  if (!stage) return res.status(404).json({ error: "job not found or lease invalid" });
  res.json({ stage: mapStage(stage) });
});

jobsRouter.post("/:id/artifacts", async (req, res) => {
  const { agentId, leaseToken, stage, contentType, path: artifactPath, byteSize } = req.body ?? {};
  if (!agentId || !leaseToken || !stage || !contentType || !artifactPath || typeof byteSize !== "number") {
    return res.status(400).json({ error: "agentId, leaseToken, stage, contentType, path, byteSize are required" });
  }

  const artifact = await recordJobArtifact(
    req.params.id,
    { agentId, leaseToken },
    { stage, contentType, path: artifactPath, byteSize }
  );
  if (!artifact) return res.status(404).json({ error: "job not found or lease invalid" });
  res.json({ artifact: mapArtifact(artifact) });
});

jobsRouter.post("/:id/complete", async (req, res) => {
  const parsed = parseCompleteRequest(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await completeJobForAgent(
      req.params.id,
      { agentId: parsed.data.agentId, leaseToken: parsed.data.leaseToken },
      parsed.data.output
    );
    if (!result) return res.status(404).json({ error: "job not found or lease invalid" });
    res.json({ job: mapJob(result) });
  } catch (err) {
    if (isOutputValidationError(err)) {
      return res.status(400).json({ error: "invalid output for job kind", details: err.flatten() });
    }
    throw err;
  }
});

jobsRouter.post("/:id/fail", async (req, res) => {
  const parsed = parseFailRequest(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { agentId, leaseToken, stage, error, terminal } = parsed.data;

  const result = await failJobForAgent(
    req.params.id,
    { agentId, leaseToken },
    { stage, error, terminal }
  );
  if (!result) return res.status(404).json({ error: "job not found or lease invalid" });
  res.json({ job: mapJob(result) });
});
