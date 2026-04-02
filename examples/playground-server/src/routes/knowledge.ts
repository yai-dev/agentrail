/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { KnowledgeManager } from "@agentrail/knowledge";
import type { IngestionEvent } from "@agentrail/knowledge";
import { runIngestionAgent } from "../agents/ingestion-agent.js";
import { config } from "../config.js";

const km = new KnowledgeManager(config.dataDir);

const KB_ID_RE = /^[a-z0-9_-]+$/;

function getTenant(c: { req: { query: (k: string) => string | undefined } }): string {
  return c.req.query("tenantId") ?? "default";
}

/** Guard against invalid/undefined kbId reaching filesystem operations */
function validateKbId(kbId: string): boolean {
  return KB_ID_RE.test(kbId);
}

export const knowledge = new Hono();

// ── GET /api/knowledge — list all KBs ─────────────────────────────────────
knowledge.get("/", async (c) => {
  const tenantId = getTenant(c);
  const ids = await km.listKbs(tenantId);
  return c.json({ kbs: ids });
});

// ── DELETE /api/knowledge/:kbId — delete entire KB ────────────────────────
knowledge.delete("/:kbId", async (c) => {
  const kbId = c.req.param("kbId") ?? "";
  if (!validateKbId(kbId)) return c.json({ error: "Invalid kbId" }, 400);
  const tenantId = getTenant(c);
  await km.deleteKb(tenantId, kbId);
  return c.json({ ok: true });
});

// ── POST /api/knowledge/:kbId/init — create / ensure KB exists ────────────
knowledge.post("/:kbId/init", async (c) => {
  const kbId = c.req.param("kbId") ?? "";
  if (!validateKbId(kbId)) return c.json({ error: "Invalid kbId" }, 400);
  const tenantId = getTenant(c);
  await km.initKb(tenantId, kbId);
  return c.json({ ok: true, kbId });
});

// ── POST /api/knowledge/:kbId/documents/stream ─────────────────────────────
// Phase 1 + Phase 2 combined; streams IngestionEvents via SSE
knowledge.post("/:kbId/documents/stream", async (c) => {
  const kbId = c.req.param("kbId") ?? "";
  if (!validateKbId(kbId)) return c.json({ error: "Invalid kbId" }, 400);
  const tenantId = getTenant(c);

  let body: { title?: string; content?: string };
  try {
    body = await c.req.json<{ title?: string; content?: string }>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.title || !body.content) {
    return c.json({ error: "Fields 'title' and 'content' are required" }, 400);
  }

  // Ensure KB is initialized
  try {
    await km.initKb(tenantId, kbId);
  } catch {
    // already exists — fine
  }

  // Phase 1: store raw document synchronously
  const { docId } = await km.storeRawDocument(tenantId, kbId, {
    title: body.title,
    content: body.content,
  });
  const job = await km.createJob(tenantId, kbId, docId);
  await km.updateJob(tenantId, kbId, job.jobId, { status: "processing" });

  const kbDir = km.getKbDir(tenantId, kbId);
  const taxonomy = await km.getTaxonomy(tenantId, kbId);

  return streamText(c, async (textStream) => {
    const send = async (event: IngestionEvent) => {
      await textStream.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    await send({ type: "job_created", jobId: job.jobId, docId });

    // Mutable local copy — updated in the callback so each map() sees current state
    let liveSteps = [...job.steps];

    try {
      const result = await runIngestionAgent({
        knowledgeManager: km,
        tenantId,
        kbDir,
        docId,
        title: body.title!,
        taxonomy,
        modelConfig: {
          provider: config.provider,
          modelId: config.modelId,
          ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        },
        onEvent: async (event) => {
          await send(event);

          if (event.type === "step_start") {
            liveSteps = liveSteps.map((s) =>
              s.step === event.step
                ? ({ ...s, status: "pending" as const } as (typeof liveSteps)[number])
                : s,
            );
            await km.updateJob(tenantId, kbId, job.jobId, { steps: liveSteps });
          } else if (event.type === "step_complete") {
            liveSteps = liveSteps.map((s) =>
              s.step === event.step
                ? ({ ...s, status: "done" as const } as (typeof liveSteps)[number])
                : s,
            );
            await km.updateJob(tenantId, kbId, job.jobId, { steps: liveSteps });
          } else if (event.type === "step_error") {
            liveSteps = liveSteps.map((s) =>
              s.step === event.step
                ? ({
                    ...s,
                    status: "error" as const,
                    error: event.error,
                  } as (typeof liveSteps)[number])
                : s,
            );
            await km.updateJob(tenantId, kbId, job.jobId, { steps: liveSteps });
          }
        },
      });

      // Phase 2 complete: finalize document
      const meta = await km.finalizeDocument(tenantId, kbId, docId, result);
      liveSteps = liveSteps.map((s) =>
        s.step === "register"
          ? ({ ...s, status: "done" as const } as (typeof liveSteps)[number])
          : s,
      );
      await km.updateJob(tenantId, kbId, job.jobId, { status: "ready", steps: liveSteps });

      await send({ type: "step_complete", step: "register" });
      await send({ type: "job_complete", meta });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await km.updateDocStatus(tenantId, kbId, docId, "failed");
      await km.updateJob(tenantId, kbId, job.jobId, { status: "failed" });
      await send({ type: "job_failed", error });
    }
  });
});

// ── GET /api/knowledge/:kbId/documents ────────────────────────────────────
knowledge.get("/:kbId/documents", async (c) => {
  const kbId = c.req.param("kbId") ?? "";
  if (!validateKbId(kbId)) return c.json({ error: "Invalid kbId" }, 400);
  const tenantId = getTenant(c);
  const category = c.req.query("category");

  try {
    // Read-only: do NOT initKb here — return empty list if KB doesn't exist yet
    const docs = await km.listDocuments(tenantId, kbId, category);
    return c.json({ documents: docs });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

// ── DELETE /api/knowledge/:kbId/documents/:docId ──────────────────────────
knowledge.delete("/:kbId/documents/:docId", async (c) => {
  const kbId = c.req.param("kbId") ?? "";
  if (!validateKbId(kbId)) return c.json({ error: "Invalid kbId" }, 400);
  const docId = c.req.param("docId");
  const tenantId = getTenant(c);

  try {
    await km.removeDocument(tenantId, kbId, docId);
    return c.json({ ok: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

// ── GET /api/knowledge/:kbId/search ───────────────────────────────────────
knowledge.get("/:kbId/search", async (c) => {
  const kbId = c.req.param("kbId") ?? "";
  if (!validateKbId(kbId)) return c.json({ error: "Invalid kbId" }, 400);
  const tenantId = getTenant(c);
  const q = c.req.query("q") ?? "";

  if (!q) return c.json({ results: [] });

  try {
    const results = await km.search(tenantId, kbId, q);
    return c.json({ results });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

// ── GET /api/knowledge/:kbId/indexes/:topic ───────────────────────────────
knowledge.get("/:kbId/indexes/:topic", async (c) => {
  const kbId = c.req.param("kbId") ?? "";
  if (!validateKbId(kbId)) return c.json({ error: "Invalid kbId" }, 400);
  const topic = c.req.param("topic");
  const tenantId = getTenant(c);

  try {
    const content = await km.getIndex(tenantId, kbId, topic);
    if (!content) return c.json({ error: "Index not found" }, 404);
    return c.json({ topic, content });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 500);
  }
});

// ── GET /api/knowledge/:kbId/jobs/:jobId ─────────────────────────────────
knowledge.get("/:kbId/jobs/:jobId", async (c) => {
  const kbId = c.req.param("kbId") ?? "";
  if (!validateKbId(kbId)) return c.json({ error: "Invalid kbId" }, 400);
  const jobId = c.req.param("jobId");
  const tenantId = getTenant(c);

  try {
    const job = await km.getJob(tenantId, kbId, jobId);
    return c.json({ job });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 404);
  }
});
