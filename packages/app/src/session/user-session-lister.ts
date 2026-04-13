/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionMeta } from "@agentrail/core";

/**
 * Provides user-scoped session listing for background services such as the
 * user-memory consolidation plugin.
 *
 * Kept separate from `AgentrailSessionStore` because this is a read-side
 * administrative capability, not a per-request store operation.
 *
 * `SessionManager` implements this interface via its existing
 * `listSessionIdsByUser` method.
 */
export interface UserSessionLister {
  listSessionsByUser(tenantId: string, userId: string): Promise<SessionMeta[]>;
}
