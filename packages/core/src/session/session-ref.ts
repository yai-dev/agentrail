/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

declare const sessionRefBrand: unique symbol;

export type SessionRef = string & {
  readonly [sessionRefBrand]: true;
};

export interface SessionRefInfo {
  tenantId: string;
  sessionId: string;
}

export function createSessionRef(tenantId: string, sessionId: string): SessionRef {
  return JSON.stringify([tenantId, sessionId]) as SessionRef;
}

export function resolveSessionRef(sessionRef: SessionRef): SessionRefInfo {
  const parsed = JSON.parse(sessionRef) as unknown;
  if (
    Array.isArray(parsed) &&
    parsed.length === 2 &&
    typeof parsed[0] === "string" &&
    typeof parsed[1] === "string"
  ) {
    return {
      tenantId: parsed[0],
      sessionId: parsed[1],
    };
  }

  throw new Error("Invalid SessionRef");
}
