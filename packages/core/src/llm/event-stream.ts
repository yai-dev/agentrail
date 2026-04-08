/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AssistantMessage, LlmStreamEvent } from "@/types/index.js";

/** Generic async event stream that also exposes a final result promise. */
export class EventStream<TEvent, TResult = TEvent> implements AsyncIterable<TEvent> {
  private queue: TEvent[] = [];
  private waiting: ((value: IteratorResult<TEvent>) => void)[] = [];
  private done = false;
  private finalResultPromise: Promise<TResult>;
  private resolveFinalResult!: (result: TResult) => void;

  constructor(
    private isComplete: (event: TEvent) => boolean,
    private extractResult: (event: TEvent) => TResult,
  ) {
    this.finalResultPromise = new Promise((resolve) => {
      this.resolveFinalResult = resolve;
    });
  }

  push(event: TEvent): void {
    if (this.done) return;

    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }

    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  end(result?: TResult): void {
    this.done = true;
    if (result !== undefined) {
      this.resolveFinalResult(result);
    }
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter({ value: undefined as unknown as TEvent, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<TEvent> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        return;
      } else {
        const result = await new Promise<IteratorResult<TEvent>>((resolve) =>
          this.waiting.push(resolve),
        );
        if (result.done) return;
        yield result.value;
      }
    }
  }

  result(): Promise<TResult> {
    return this.finalResultPromise;
  }
}

/** Event stream specialized for assembling a final assistant message from LLM events. */
export class AssistantMessageEventStream extends EventStream<LlmStreamEvent, AssistantMessage> {
  constructor() {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => {
        if (event.type === "done") {
          return event.message;
        } else if (event.type === "error") {
          return event.message;
        }
        throw new Error("Unexpected event type for final result");
      },
    );
  }
}
