/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailSessionStore } from "@agentrail/core";
import { Hono } from "hono";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Result of a single readiness check. */
export interface ReadinessCheckResult {
  name: string;
  status: "ok" | "fail";
  error?: string;
}

/**
 * A single readiness check function.
 * Resolve to report healthy; throw (or return a non-ok result) to report failure.
 */
export type ReadinessCheck = () => Promise<ReadinessCheckResult> | ReadinessCheckResult;

/** Response body for `GET /ready`. Compatible with Kubernetes readiness probes. */
export interface ReadinessResponse {
  status: "ready" | "not_ready";
  checks: ReadinessCheckResult[];
}

// ─── Built-in checks ─────────────────────────────────────────────────────────

/**
 * Built-in readiness check that calls `sessionStore.ping()` when available.
 * Falls back to a trivial pass when the store has no `ping` implementation.
 */
export function createSessionStoreCheck(sessionStore: AgentrailSessionStore): ReadinessCheck {
  return async (): Promise<ReadinessCheckResult> => {
    if (typeof sessionStore.ping !== "function") {
      return { name: "session_store", status: "ok" };
    }
    try {
      await sessionStore.ping();
      return { name: "session_store", status: "ok" };
    } catch (err) {
      return {
        name: "session_store",
        status: "fail",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

// ─── Route factory ────────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app that exposes:
 * - `GET /health` — liveness probe (always 200 when the process is alive)
 * - `GET /ready`  — readiness probe (runs all checks; 503 if any fail)
 *
 * Mount with `app.route("/", createHealthRoute(...))` so the paths are
 * `/health` and `/ready` relative to the parent app root.
 */
export function createHealthRoute(
  sessionStore: AgentrailSessionStore,
  extraChecks: ReadinessCheck[] = [],
): Hono {
  const route = new Hono();

  // ── Liveness ──────────────────────────────────────────────────────────────
  route.get("/health", (c) => c.json({ status: "ok" }));

  // ── Readiness ─────────────────────────────────────────────────────────────
  route.get("/ready", async (c) => {
    const allChecks: ReadinessCheck[] = [createSessionStoreCheck(sessionStore), ...extraChecks];

    const results = await Promise.all(
      allChecks.map(async (check): Promise<ReadinessCheckResult> => {
        try {
          return await check();
        } catch (err) {
          return {
            name: "unknown",
            status: "fail",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const allOk = results.every((r) => r.status === "ok");
    const body: ReadinessResponse = {
      status: allOk ? "ready" : "not_ready",
      checks: results,
    };
    return c.json(body, allOk ? 200 : 503);
  });

  return route;
}
