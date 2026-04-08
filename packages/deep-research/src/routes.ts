/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createSessionRef } from "@agentrail/core";
import { Hono } from "hono";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createFileSystemDeepResearchStore } from "@/store.js";
import { slugifyTitle } from "@/utils.js";

const ARTIFACT_MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export interface DeepResearchRouteOptions {
  dataDir: string;
}

function resolveWorkspaceHostPath(
  dataDir: string,
  sessionId: string,
  containerPath: string,
): string {
  if (!containerPath.startsWith("/workspace/")) {
    throw new Error("Invalid path: must start with /workspace/");
  }

  const rel = containerPath.slice("/workspace/".length);
  const workspaceDir = path.join(dataDir, "sandboxes", sessionId);
  const hostPath = path.resolve(workspaceDir, rel);

  if (!hostPath.startsWith(workspaceDir + path.sep) && hostPath !== workspaceDir) {
    throw new Error("Path traversal not allowed");
  }

  return hostPath;
}

async function findPersistedArtifactPath(
  dataDir: string,
  tenantId: string,
  sessionId: string,
  requestedRunId: string | undefined,
  artifactId: string | undefined,
  containerPath: string | undefined,
): Promise<string | null> {
  const store = createFileSystemDeepResearchStore(dataDir, createSessionRef(tenantId, sessionId));
  const state = requestedRunId
    ? await store.loadState(requestedRunId)
    : await store.loadLatestState();

  if (!state) return null;

  let artifact = artifactId ? state.artifacts.find((item) => item.id === artifactId) : undefined;

  if (!artifact && containerPath) {
    artifact = [...state.artifacts].reverse().find((item) => item.path === containerPath);
  }

  if (!artifact) return null;

  const artifactsDir = store.getArtifactsDir(state.run.id);
  if (artifact.storedFileName) {
    return path.join(artifactsDir, artifact.storedFileName);
  }

  const ext = path.extname(artifact.path).toLowerCase();
  const slug = slugifyTitle(artifact.title);
  const files = await readdir(artifactsDir).catch(() => []);
  const matches = files.filter((file) => {
    if (ext && !file.toLowerCase().endsWith(ext)) return false;
    return file.includes(`-${slug}`);
  });

  if (matches.length === 0) return null;

  const enriched = await Promise.all(
    matches.map(async (file) => {
      const fullPath = path.join(artifactsDir, file);
      const fileStat = await stat(fullPath).catch(() => null);
      return fileStat ? { fullPath, mtimeMs: fileStat.mtimeMs } : null;
    }),
  );

  return (
    enriched
      .filter((item): item is { fullPath: string; mtimeMs: number } => item !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.fullPath ?? null
  );
}

export function createDeepResearchRoute(options: DeepResearchRouteOptions): Hono {
  const deepResearch = new Hono();

  deepResearch.get("/:sessionId/deep-research", async (c) => {
    const { sessionId } = c.req.param();
    const tenantId = c.req.query("tenantId") ?? "default";
    const requestedRunId = c.req.query("runId");
    const store = createFileSystemDeepResearchStore(
      options.dataDir,
      createSessionRef(tenantId, sessionId),
    );

    const state = requestedRunId
      ? await store.loadState(requestedRunId)
      : await store.loadLatestState();

    if (!state) {
      return c.json({ state: null, events: [] });
    }

    const events = await store.loadEvents(state.run.id);
    return c.json({ state, events });
  });

  deepResearch.get("/:sessionId/deep-research/artifact", async (c) => {
    const { sessionId } = c.req.param();
    const tenantId = c.req.query("tenantId") ?? "default";
    const requestedRunId = c.req.query("runId") ?? undefined;
    const artifactId = c.req.query("artifactId") ?? undefined;
    const containerPath = c.req.query("path") ?? "";

    let hostPath: string | null = null;

    if (containerPath) {
      try {
        hostPath = resolveWorkspaceHostPath(options.dataDir, sessionId, containerPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ error: message }, 400);
      }
    }

    if (!hostPath && !artifactId) {
      return c.json({ error: "Missing artifact reference" }, 400);
    }

    try {
      const content = await readFile(hostPath ?? "");
      const ext = path.extname(hostPath ?? "").toLowerCase();
      return new Response(content, {
        headers: {
          "Content-Type": ARTIFACT_MIME_MAP[ext] ?? "application/octet-stream",
          "Cache-Control": "no-store, no-cache",
        },
      });
    } catch {
      const fallbackPath = await findPersistedArtifactPath(
        options.dataDir,
        tenantId,
        sessionId,
        requestedRunId,
        artifactId,
        containerPath || undefined,
      );
      if (!fallbackPath) {
        return c.json({ error: "Artifact not found" }, 404);
      }

      try {
        const content = await readFile(fallbackPath);
        const ext = path.extname(fallbackPath).toLowerCase();
        return new Response(content, {
          headers: {
            "Content-Type": ARTIFACT_MIME_MAP[ext] ?? "application/octet-stream",
            "Cache-Control": "no-store, no-cache",
          },
        });
      } catch {
        return c.json({ error: "Artifact not found" }, 404);
      }
    }
  });

  return deepResearch;
}
