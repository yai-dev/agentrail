/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import type { TSchema, Static } from "@sinclair/typebox";
import type { TextContent, ImageContent } from "./content.types.js";

export interface ToolDefinition<TParameters extends TSchema = TSchema> {
	name: string;
	description: string;
	parameters: TParameters;
}

export interface ToolResult<TDetails = unknown> {
	readonly content: (TextContent | ImageContent)[];
	readonly details: TDetails;
}

export type ToolUpdateCallback<TDetails = unknown> = (
	partialResult: ToolResult<TDetails>,
) => void;

export type ToolSignalEvent =
	| {
		readonly type: "waiting_for_input";
		readonly question: string;
		readonly hint?: string;
		readonly options?: string[];
		readonly multiple?: boolean;
		readonly custom?: boolean;
	  };

export interface RuntimeTool<
	TParameters extends TSchema = TSchema,
	TDetails = unknown,
> extends ToolDefinition<TParameters> {
	label: string;

	execute(
		toolCallId: string,
		params: Static<TParameters>,
		signal?: AbortSignal,
		onUpdate?: ToolUpdateCallback<TDetails>,
		onSignal?: (event: ToolSignalEvent) => void,
	): Promise<ToolResult<TDetails>>;
}

export type ExtractToolParams<T> = T extends RuntimeTool<infer P, unknown>
	? Static<P>
	: never;

export type ExtractToolDetails<T> = T extends RuntimeTool<TSchema, infer D>
	? D
	: never;
