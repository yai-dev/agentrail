/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SessionManager } from "@agentrail/memo";
import type { AgentrailSessionStore } from "../src/types.js";

function asSessionStore(store: AgentrailSessionStore): AgentrailSessionStore {
  return store;
}

describe("AgentrailSessionStore", () => {
  it("is structurally compatible with SessionManager", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "agentrail-session-store-"));
    const sessionStore = asSessionStore(new SessionManager(tempDir));

    expect(typeof sessionStore.getOrCreate).toBe("function");
    expect(typeof sessionStore.getSessionDir).toBe("function");
    expect(typeof sessionStore.loadMessages).toBe("function");
    expect(typeof sessionStore.loadMessagesWithBudget).toBe("function");
    expect(typeof sessionStore.loadAllMessages).toBe("function");
    expect(typeof sessionStore.appendMessages).toBe("function");
    expect(typeof sessionStore.recordTurn).toBe("function");
    expect(typeof sessionStore.compactIfNeeded).toBe("function");

    rmSync(tempDir, { recursive: true, force: true });
  });
});
