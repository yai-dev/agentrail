/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { CapabilityDescriptor } from "@agentrail/capabilities";
import type { ProfileDefinition } from "@/profile/define-profile.js";

// ─── Environment detection ────────────────────────────────────────────────────

type RuntimeEnv = "serverless" | "container" | "process";

/** Detects the broad deployment environment of the current process. */
function detectRuntimeEnv(): RuntimeEnv {
  // Serverless platforms
  if (
    process.env["AWS_LAMBDA_FUNCTION_NAME"] ??
    process.env["VERCEL"] ??
    process.env["CF_PAGES"] ??
    process.env["NETLIFY"] ??
    process.env["FUNCTIONS_WORKER_RUNTIME"]
  ) {
    return "serverless";
  }
  // Kubernetes / Docker
  if (process.env["KUBERNETES_SERVICE_HOST"]) {
    return "container";
  }
  return "process";
}

// ─── Capability-level warnings ────────────────────────────────────────────────

/**
 * Capability types that require a Docker sandbox (`SandboxManager`).
 * These capabilities send shell commands or browser actions to an isolated
 * container, so they cannot function without a running sandbox image.
 */
const SANDBOX_REQUIRED_TYPES = new Set(["filesystem", "browser"]);

/**
 * Capability types that maintain persistent cross-request state.
 * They are fundamentally incompatible with stateless serverless environments
 * where each invocation starts a fresh process.
 */
const SERVERLESS_INCOMPATIBLE_TYPES = new Set([
  "filesystem",
  "browser",
  "orchestration",
]);

/**
 * Capability types that degrade in serverless environments but may still work
 * with appropriate adapter implementations.
 */
const SERVERLESS_DEGRADED_TYPES = new Map<string, string>([
  ["skills", "skills in delegate mode spawns sub-agent processes"],
  ["ask-user", "ask-user relies on long-lived stateful sessions"],
]);

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Performs startup-time compatibility checks for all statically known profiles.
 *
 * Rules:
 * 1. `filesystem`/`browser` + no `sandboxManager` → `warn` (sandbox not wired)
 * 2. `filesystem`/`browser`/`orchestration` + serverless env → `warn`
 * 3. `skills`/`ask-user` + serverless env → `warn` (degraded but may work)
 *
 * Warnings are emitted via `console.warn` and never throw, so a misconfigured
 * profile causes a visible hint rather than a hard startup failure.
 */
export function runCapabilityCompatibilityChecks(
  profiles: ProfileDefinition[],
  hasSandboxManager: boolean,
): void {
  const env = detectRuntimeEnv();

  for (const profile of profiles) {
    const capabilities: CapabilityDescriptor[] = profile.capabilities ?? [];
    for (const cap of capabilities) {
      const type = cap.type;

      // Rule 1 – sandbox required but not wired
      if (SANDBOX_REQUIRED_TYPES.has(type) && !hasSandboxManager) {
        console.warn(
          `[agentrail] Warning: profile "${profile.id}" uses the "${type}" capability, ` +
            `which requires a SandboxManager but none was provided to createAgentApp(). ` +
            `The "${type}" tools will fail at runtime. Pass \`sandboxManager\` to enable sandbox support.`,
        );
      }

      // Rule 2 – incompatible with serverless
      if (env === "serverless" && SERVERLESS_INCOMPATIBLE_TYPES.has(type)) {
        console.warn(
          `[agentrail] Warning: profile "${profile.id}" uses the "${type}" capability, ` +
            `which requires persistent state or process isolation. ` +
            `This is not compatible with serverless environments. ` +
            `Consider switching to a container or long-running process deployment.`,
        );
      }

      // Rule 3 – degraded in serverless
      if (env === "serverless" && SERVERLESS_DEGRADED_TYPES.has(type)) {
        const reason = SERVERLESS_DEGRADED_TYPES.get(type);
        console.warn(
          `[agentrail] Warning: profile "${profile.id}" uses the "${type}" capability ` +
            `(${reason}). This may not work correctly in stateless serverless environments.`,
        );
      }
    }
  }
}
