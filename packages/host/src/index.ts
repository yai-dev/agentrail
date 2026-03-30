/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Public host runtime surface.
 *
 * `@agentrail/host` exposes low-level primitives, while `@agentrail/host/defaults`
 * provides the recommended, opinionated SDK for most integrations.
 */
export * from "./types.js";
export * from "./chat-route.js";
export * from "./context-pipeline.js";
export * from "./defaults.js";
export * from "./orchestration-registry.js";
export * from "./plugins.js";
export * from "./profile-registry.js";
export * from "./stream-route.js";
