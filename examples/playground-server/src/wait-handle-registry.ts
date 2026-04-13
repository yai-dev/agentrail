/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

interface QuestionHandle {
  kind: "question";
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  question: string;
  registeredAt: number;
}

interface PermissionHandle {
  kind: "permission";
  resolve: (decision: "approved" | "rejected") => void;
  reject: (err: Error) => void;
  toolCallId: string;
  toolName: string;
  reason?: string;
  registeredAt: number;
}

type WaitHandle = QuestionHandle | PermissionHandle;

class WaitHandleRegistry {
  private readonly handles = new Map<string, WaitHandle>();

  // ── Question handles (AskUserQuestion tool) ───────────────────────────────

  register(sessionId: string, question: string): Promise<string> {
    this.cancel(sessionId);

    return new Promise<string>((resolve, reject) => {
      this.handles.set(sessionId, {
        kind: "question",
        resolve,
        reject,
        question,
        registeredAt: Date.now(),
      });
    });
  }

  // ── Permission handles (interactive approval) ─────────────────────────────

  registerPermission(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    reason?: string,
  ): Promise<"approved" | "rejected"> {
    this.cancel(sessionId);

    return new Promise<"approved" | "rejected">((resolve, reject) => {
      this.handles.set(sessionId, {
        kind: "permission",
        resolve,
        reject,
        toolCallId,
        toolName,
        reason,
        registeredAt: Date.now(),
      });
    });
  }

  // ── Respond ───────────────────────────────────────────────────────────────

  respond(sessionId: string, answer: string): boolean {
    const handle = this.handles.get(sessionId);
    if (!handle || handle.kind !== "question") return false;
    this.handles.delete(sessionId);
    handle.resolve(answer);
    return true;
  }

  respondPermission(sessionId: string, decision: "approved" | "rejected"): boolean {
    const handle = this.handles.get(sessionId);
    if (!handle || handle.kind !== "permission") return false;
    this.handles.delete(sessionId);
    handle.resolve(decision);
    return true;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  cancel(sessionId: string): void {
    const handle = this.handles.get(sessionId);
    if (handle) {
      this.handles.delete(sessionId);
      handle.reject(new Error("Wait handle superseded by a new registration"));
    }
  }

  hasPending(sessionId: string): boolean {
    return this.handles.has(sessionId);
  }

  getPendingKind(sessionId: string): "question" | "permission" | null {
    return this.handles.get(sessionId)?.kind ?? null;
  }
}

export const waitHandleRegistry = new WaitHandleRegistry();
