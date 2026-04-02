/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  AgentInput,
  AgentResult,
  AgentRunOptions,
  AgentStream,
} from "../types/agent.types.js";

/**
 * Executable runtime agent interface.
 *
 * Agents can be invoked once, streamed, or run in batch depending on the host
 * integration strategy.
 *
 * @see {@link https://agentrail.run/concepts/agents}
 */
export interface Agent {
  /** Stable identifier of the agent instance. */
  readonly id: string;

  /** Human-readable agent name used in logs and UI surfaces. */
  readonly name: string;

  /** Runs the agent to completion and resolves with the final aggregated result. */
  invoke(input: AgentInput, options?: AgentRunOptions): Promise<AgentResult>;

  /** Streams runtime events while the agent executes. */
  stream(input: AgentInput, options?: AgentRunOptions): AgentStream;

  /** Runs the agent independently for each input using shared invocation options. */
  batch(inputs: AgentInput[], options?: AgentRunOptions): Promise<AgentResult[]>;
}
