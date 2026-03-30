/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import type {
	AgentInput,
	AgentRunOptions,
	AgentResult,
	AgentStream,
} from "../types/agent.types.js";

export interface Agent {
	readonly id: string;

	readonly name: string;

	invoke(input: AgentInput, options?: AgentRunOptions): Promise<AgentResult>;

	stream(input: AgentInput, options?: AgentRunOptions): AgentStream;

	batch(inputs: AgentInput[], options?: AgentRunOptions): Promise<AgentResult[]>;
}
