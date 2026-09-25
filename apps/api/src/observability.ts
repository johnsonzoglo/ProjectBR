import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const startedAt = Date.now();
let requests = 0;
let errors = 0;

export function requestTelemetry(req: Request, res: Response, next: NextFunction) {
  const requestId = typeof req.headers["x-request-id"] === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(req.headers["x-request-id"]) ? req.headers["x-request-id"] : randomUUID();
  const start = performance.now();
  requests += 1;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    if (res.statusCode >= 500) errors += 1;
    const entry = { level: res.statusCode >= 500 ? "error" : "info", event: "http_request", requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(performance.now() - start), at: new Date().toISOString() };
    (res.statusCode >= 500 ? console.error : console.log)(JSON.stringify(entry));
  });
  next();
}

export function metricsText(queue: { pending: number; failed: number }) {
  return [`# HELP rewardly_uptime_seconds Process uptime`, `# TYPE rewardly_uptime_seconds gauge`, `rewardly_uptime_seconds ${Math.floor((Date.now()-startedAt)/1000)}`, `# TYPE rewardly_http_requests_total counter`, `rewardly_http_requests_total ${requests}`, `# TYPE rewardly_http_errors_total counter`, `rewardly_http_errors_total ${errors}`, `# TYPE rewardly_jobs_pending gauge`, `rewardly_jobs_pending ${queue.pending}`, `# TYPE rewardly_jobs_failed gauge`, `rewardly_jobs_failed ${queue.failed}`, ""].join("\n");
}
