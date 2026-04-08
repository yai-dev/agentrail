/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/** Plain text content block used in user, assistant, and tool result messages. */
export interface TextContent {
  /** Discriminator for text content blocks. */
  readonly type: "text";
  /** UTF-8 text content visible to the model or caller. */
  readonly text: string;
  /** Optional provider-issued signature for streamed text integrity checks. */
  readonly textSignature?: string;
}

/** Provider-specific reasoning or hidden-thought content block. */
export interface ThinkingContent {
  /** Discriminator for thinking content blocks. */
  readonly type: "thinking";
  /** Reasoning text returned by providers that expose it. */
  readonly thinking: string;
  /** Optional provider-issued signature for streamed reasoning integrity checks. */
  readonly thinkingSignature?: string;
}

/** Inline image content block encoded as base64 data. */
export interface ImageContent {
  /** Discriminator for image content blocks. */
  readonly type: "image";
  /** Base64-encoded image payload. */
  readonly data: string;
  /** MIME type of the encoded image. */
  readonly mimeType: string;
}

/** Structured tool call emitted by a model. */
export interface ToolCall {
  /** Discriminator for tool call content blocks. */
  readonly type: "toolCall";
  /** Unique call identifier assigned by the provider. */
  readonly id: string;
  /** Name of the tool the model wants to invoke. */
  readonly name: string;
  /** Parsed tool arguments supplied by the model. */
  readonly arguments: Record<string, unknown>;
  /** Optional provider-issued signature that ties the call to hidden reasoning state. */
  readonly thoughtSignature?: string;
}

/** Content blocks allowed inside an assistant message. */
export type AssistantContent = TextContent | ThinkingContent | ToolCall;

/** Content blocks allowed inside user input. */
export type UserContent = TextContent | ImageContent;

/** Content blocks allowed inside a tool result message. */
export type ToolResultContent = TextContent | ImageContent;
