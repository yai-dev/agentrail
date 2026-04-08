/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/** Cost breakdown reported by a provider for a single invocation or message. */
export interface Cost {
  /** Cost attributed to prompt or input tokens. */
  readonly input: number;
  /** Cost attributed to generated output tokens. */
  readonly output: number;
  /** Cost attributed to cache reads, when supported by the provider. */
  readonly cacheRead: number;
  /** Cost attributed to cache writes, when supported by the provider. */
  readonly cacheWrite: number;
  /** Total billed cost across all categories. */
  readonly total: number;
}

/** Token and billing summary for a model invocation. */
export interface Usage {
  /** Prompt or input token count. */
  readonly inputTokens: number;
  /** Generated output token count. */
  readonly outputTokens: number;
  /** Cache-read token count when provided by the backend. */
  readonly cacheReadTokens: number;
  /** Cache-write token count when provided by the backend. */
  readonly cacheWriteTokens: number;
  /** Total token count across all categories. */
  readonly totalTokens: number;
  /** Monetary or abstract cost breakdown for the invocation. */
  readonly cost: Cost;
}
