/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect } from "vitest";
import { createSessionRef, resolveSessionRef } from "../src/session/session-ref.js";

describe("session-ref", () => {
  it("createSessionRef produces a branded string", () => {
    const ref = createSessionRef("tenant1", "session42");
    // resolveSessionRef should recover the original parts
    const info = resolveSessionRef(ref);
    expect(info.tenantId).toBe("tenant1");
    expect(info.sessionId).toBe("session42");
  });

  it("two refs with the same inputs are equal", () => {
    const a = createSessionRef("t", "s");
    const b = createSessionRef("t", "s");
    expect(a).toBe(b);
  });

  it("two refs with different inputs are not equal", () => {
    const a = createSessionRef("t1", "s");
    const b = createSessionRef("t2", "s");
    expect(a).not.toBe(b);
  });
});
