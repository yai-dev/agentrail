/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import { Type, type TSchema, type Static } from "@sinclair/typebox";
import type { RuntimeTool, ToolResult, ToolSignalEvent } from "../types/tool.types.js";

// ============================================================================
// ============================================================================

export interface ToolExecutionContext {
	readonly toolCallId: string;

	readonly signal?: AbortSignal;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly onUpdate: (partialResult: ToolResult<any>) => void;

	readonly onSignal?: (event: ToolSignalEvent) => void;
}

// ============================================================================
// ============================================================================

interface ToolConfig<TParams, TDetails> {
	name?: string;
	label?: string;
	description?: string;
	parameters?: TSchema;
	execute?: (params: TParams, ctx: ToolExecutionContext) => Promise<ToolResult<TDetails>>;
}

export class ToolBuilder<TParams = undefined, TDetails = unknown> {
	private config: ToolConfig<TParams, TDetails> = {};

	name(name: string): this {
		this.config.name = name;
		return this;
	}

	label(label: string): this {
		this.config.label = label;
		return this;
	}

	description(desc: string): this {
		this.config.description = desc;
		return this;
	}

	parameters<T extends TSchema>(schema: T): ToolBuilder<Static<T>, TDetails> {
		const builder = new ToolBuilder<Static<T>, TDetails>();
		(builder as unknown as { config: ToolConfig<Static<T>, TDetails> }).config = {
			...this.config,
			parameters: schema,
		} as ToolConfig<Static<T>, TDetails>;
		return builder;
	}

	execute(
		fn: (params: TParams, ctx: ToolExecutionContext) => Promise<ToolResult<TDetails>>,
	): this {
		this.config.execute = fn;
		return this;
	}

	build(): RuntimeTool<TSchema, TDetails> {
		if (!this.config.name) {
			throw new Error("Tool name is required");
		}
		if (!this.config.description) {
			throw new Error("Tool description is required");
		}
		if (!this.config.execute) {
			throw new Error("Tool execute function is required");
		}

		const parameters = this.config.parameters ?? Type.Object({});
		const executeFn = this.config.execute;

		return {
			name: this.config.name,
			label: this.config.label ?? this.config.name,
			description: this.config.description,
			parameters,
			execute: async (
				toolCallId: string,
				params: Static<typeof parameters>,
				signal?: AbortSignal,
				onUpdate?: (partialResult: ToolResult<TDetails>) => void,
				onSignal?: (event: ToolSignalEvent) => void,
			): Promise<ToolResult<TDetails>> => {
				const ctx: ToolExecutionContext = {
					toolCallId,
					signal,
					onUpdate: onUpdate ?? (() => { }),
					onSignal,
				};
				return executeFn(params as TParams, ctx);
			},
		};
	}
}

// ============================================================================
// ============================================================================

export function tool(): ToolBuilder {
	return new ToolBuilder();
}

// ============================================================================
// ============================================================================

export function defineSimpleTool<TDetails = unknown>(options: {
	name: string;
	label?: string;
	description: string;
	execute: (ctx: ToolExecutionContext) => Promise<ToolResult<TDetails>>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): RuntimeTool<TSchema, any> {
	return tool()
		.name(options.name)
		.label(options.label ?? options.name)
		.description(options.description)
		.execute(async (_params, ctx) => options.execute(ctx))
		.build();
}
