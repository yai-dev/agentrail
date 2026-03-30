/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Mock Runtime Tool for testing
 */

import { Type } from "@sinclair/typebox";
import type { RuntimeTool, ToolResult } from "../../src/types/tool.types.js";
import type { TextContent } from "../../src/types/content.types.js";

/**
 * Create a mock tool for testing
 */
export function createMockTool(
	name: string,
	executeFn?: (
		toolCallId: string,
		params: Record<string, unknown>,
	) => Promise<ToolResult>,
): RuntimeTool {
	return {
		name,
		label: name,
		description: `Mock tool: ${name}`,
		parameters: Type.Object({}),
		execute: async (toolCallId, params) => {
			if (executeFn) {
				return executeFn(toolCallId, params as Record<string, unknown>);
			}
			return {
				content: [{ type: "text", text: `Executed ${name}` } as TextContent],
				details: {},
			};
		},
	};
}

/**
 * Create a mock tool that returns a specific result
 */
export function createMockToolWithResult(
	name: string,
	result: ToolResult<Record<string, unknown>>,
): RuntimeTool {
	return {
		name,
		label: name,
		description: `Mock tool: ${name}`,
		parameters: Type.Object({}),
		execute: async () => result,
	};
}

/**
 * Create a mock tool that throws an error
 */
export function createMockToolWithError(
	name: string,
	error: Error,
): RuntimeTool {
	return {
		name,
		label: name,
		description: `Mock tool: ${name}`,
		parameters: Type.Object({}),
		execute: async () => {
			throw error;
		},
	};
}
