import type { AgentrailSessionStore, Message, SessionRef, Usage } from "@agentrail/core";
import { createSessionRef } from "@agentrail/core";

export class MockSessionStore implements AgentrailSessionStore {
  private memory: Map<string, Message[]> = new Map();

  private getKey(tenantId: string, sessionId: string) {
    return `${tenantId}:${sessionId}`;
  }

  async getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string,
  ): Promise<{ sessionId: string; sessionRef: SessionRef }> {
    const id = sessionId ?? `session-${Date.now()}`;
    if (!this.memory.has(this.getKey(tenantId, id))) {
      this.memory.set(this.getKey(tenantId, id), []);
    }
    return { sessionId: id, sessionRef: createSessionRef(tenantId, id) };
  }

  async loadMessages(tenantId: string, sessionId: string, limit?: number): Promise<Message[]> {
    const messages = this.memory.get(this.getKey(tenantId, sessionId)) || [];
    if (limit) {
      return messages.slice(-limit);
    }
    return [...messages];
  }

  async loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget?: number,
  ): Promise<Message[]> {
    return this.loadMessages(tenantId, sessionId);
  }

  async loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]> {
    return this.loadMessages(tenantId, sessionId);
  }

  async appendMessages(tenantId: string, sessionId: string, messages: Message[]): Promise<void> {
    const existing = this.memory.get(this.getKey(tenantId, sessionId)) || [];
    this.memory.set(this.getKey(tenantId, sessionId), [...existing, ...messages]);
  }

  async recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void> {
    // no-op
  }

  async compactIfNeeded(
    tenantId: string,
    sessionId: string,
    summarizeFn: (messages: Message[]) => Promise<string>,
    options?: any,
  ): Promise<boolean> {
    return false;
  }
}
