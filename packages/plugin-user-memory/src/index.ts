/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailPlugin } from "@agentrail/host";
export type { UserMemoryConfig } from "./user-memory-consolidation-service.js";
export {
  UserMemoryConsolidationService,
  type UserMemoryConsolidationService as UserMemoryConsolidationServiceInstance,
} from "./user-memory-consolidation-service.js";

interface UserMemoryPluginHooks {
  start(): void;
  stop(): void;
  beginForegroundActivity(tenantId: string, userId: string): void;
  endForegroundActivity(tenantId: string, userId: string): void;
  touchActivity(tenantId: string, userId: string): Promise<void>;
}

export function createUserMemoryPlugin(
  service: UserMemoryPluginHooks,
): AgentrailPlugin {
  return {
    name: "user-memory",
    start: () => service.start(),
    stop: () => service.stop(),
    onRequestStart: ({ tenantId, userId }) =>
      service.beginForegroundActivity(tenantId, userId),
    onRequestEnd: ({ tenantId, userId }) =>
      service.endForegroundActivity(tenantId, userId),
    onTurnPersisted: ({ tenantId, userId }) =>
      service.touchActivity(tenantId, userId),
  };
}
