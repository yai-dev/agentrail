import type { AgentrailSessionStore } from "@agentrail/host";
import type { Message, Usage } from "@agentrail/runtime-core";

export class MockSessionStore implements AgentrailSessionStore {
  private memory: Map<string, Message[]> = new Map();

  private getKey(tenantId: string, sessionId: string) {
    return `${tenantId}:${sessionId}`;
  }

  async getOrCreate(
    tenantId: string,
    userId: string,
    agentId: string,
    sessionId?: string
  ): Promise<{ sessionId: string }> {
    const id = sessionId ?? `session-${Date.now()}`;
    if (!this.memory.has(this.getKey(tenantId, id))) {
      this.memory.set(this.getKey(tenantId, id), []);
    }
    return { sessionId: id };
  }

  getSessionDir(tenantId: string, sessionId: string): string {
    return `/mock/dir/${tenantId}/${sessionId}`;
  }

  async loadMessages(
    tenantId: string,
    sessionId: string,
    limit?: number
  ): Promise<Message[]> {
    const messages = this.memory.get(this.getKey(tenantId, sessionId)) || [];
    if (limit) {
      return messages.slice(-limit);
    }
    return [...messages];
  }

  async loadMessagesWithBudget(
    tenantId: string,
    sessionId: string,
    tokenBudget?: number
  ): Promise<Message[]> {
    return this.loadMessages(tenantId, sessionId);
  }

  async loadAllMessages(tenantId: string, sessionId: string): Promise<Message[]> {
    return this.loadMessages(tenantId, sessionId);
  }

  async appendMessages(
    tenantId: string,
    sessionId: string,
    messages: Message[]
  ): Promise<void> {
    const existing = this.memory.get(this.getKey(tenantId, sessionId)) || [];
    this.memory.set(this.getKey(tenantId, sessionId), [...existing, ...messages]);
  }

  async recordTurn(tenantId: string, sessionId: string, usage: Usage): Promise<void> {
    // No-op for mock
  }

  async compactIfNeeded(
    tenantId: string,
    sessionId: string,
    summarizeFn: (messages: Message[]) => Promise<string>,
    options?: any
  ): Promise<boolean> {
    // Basic mock implementation of compaction
    return false;
  }
}
