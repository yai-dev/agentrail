/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


export interface TextContent {
	readonly type: "text";
	readonly text: string;
	readonly textSignature?: string;
}

export interface ThinkingContent {
	readonly type: "thinking";
	readonly thinking: string;
	readonly thinkingSignature?: string;
}

export interface ImageContent {
	readonly type: "image";
	readonly data: string;
	readonly mimeType: string;
}

export interface ToolCall {
	readonly type: "toolCall";
	readonly id: string;
	readonly name: string;
	readonly arguments: Record<string, unknown>;
	readonly thoughtSignature?: string;
}

export type AssistantContent = TextContent | ThinkingContent | ToolCall;

export type UserContent = TextContent | ImageContent;

export type ToolResultContent = TextContent | ImageContent;
