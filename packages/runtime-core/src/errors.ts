/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


export class RuntimeError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "RuntimeError";
	}
}

export class LlmError extends RuntimeError {
	constructor(
		message: string,
		public readonly provider: string,
		public readonly modelId?: string,
		cause?: unknown,
	) {
		super(message, "LLM_ERROR", cause);
		this.name = "LlmError";
	}
}

export class ToolExecutionError extends RuntimeError {
	constructor(
		message: string,
		public readonly toolName: string,
		public readonly toolCallId: string,
		cause?: unknown,
	) {
		super(message, "TOOL_EXECUTION_ERROR", cause);
		this.name = "ToolExecutionError";
	}
}

export class ToolValidationError extends RuntimeError {
	constructor(
		message: string,
		public readonly toolName: string,
		public readonly errors?: Array<{
			path: string;
			message: string;
		}>,
	) {
		super(message, "TOOL_VALIDATION_ERROR");
		this.name = "ToolValidationError";
	}
}

export class ProviderNotFoundError extends RuntimeError {
	constructor(
		public readonly providerName: string,
	) {
		super(
			`LLM Provider not found: ${providerName}`,
			"PROVIDER_NOT_FOUND",
		);
		this.name = "ProviderNotFoundError";
	}
}

export class ToolNotFoundError extends RuntimeError {
	constructor(
		public readonly toolName: string,
	) {
		super(`Tool not found: ${toolName}`, "TOOL_NOT_FOUND");
		this.name = "ToolNotFoundError";
	}
}

export class AbortedError extends RuntimeError {
	constructor(message: string = "Execution was aborted") {
		super(message, "ABORTED");
		this.name = "AbortedError";
	}
}
