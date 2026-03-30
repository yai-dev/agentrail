/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import type { Agent } from "../interfaces/agent.js";
import type { RuntimeTool } from "../types/tool.types.js";

// ============================================================================
// ============================================================================

export interface ModelConfig {
	readonly provider: string;
	readonly modelId: string;
	readonly apiKey?: string;
	readonly baseUrl?: string;
}

// ============================================================================
// ============================================================================

export interface AgentConfig {
	readonly id: string;

	readonly name?: string;

	readonly model: string | ModelConfig;

	readonly system: string;

	readonly tools?: RuntimeTool[] | Record<string, RuntimeTool>;

	readonly maxTokens?: number;

	readonly temperature?: number;

	readonly thinkingEnabled?: boolean;

	readonly maxTurns?: number;

	readonly maxTurnsMessage?: string;
}

// ============================================================================
// ============================================================================

export function defineAgent(config: AgentConfig): Agent {
	// eslint-disable-next-line @typescript-eslint/no-use-before-define
	return new AgentImpl(config);
}

// ============================================================================
// ============================================================================


import { AgentImpl } from "./agent-impl.js";

export { AgentImpl } from "./agent-impl.js";
