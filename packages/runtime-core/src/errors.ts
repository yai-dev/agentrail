/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/** Base class for runtime errors exposed by Agentrail. */
export class RuntimeError extends Error {
  constructor(
    message: string,
    /** Stable machine-readable error code. */
    public readonly code: string,
    /** Optional original cause preserved for debugging. */
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}

/** Error raised when a provider request fails. */
export class LlmError extends RuntimeError {
  constructor(
    message: string,
    /** Provider name that failed. */
    public readonly provider: string,
    /** Optional model identifier involved in the failure. */
    public readonly modelId?: string,
    cause?: unknown,
  ) {
    super(message, "LLM_ERROR", cause);
    this.name = "LlmError";
  }
}

/** Error raised when a tool throws or returns an unusable result. */
export class ToolExecutionError extends RuntimeError {
  constructor(
    message: string,
    /** Name of the failing tool. */
    public readonly toolName: string,
    /** ID of the tool call associated with the failure. */
    public readonly toolCallId: string,
    cause?: unknown,
  ) {
    super(message, "TOOL_EXECUTION_ERROR", cause);
    this.name = "ToolExecutionError";
  }
}

/** Error raised when tool arguments do not match the declared schema. */
export class ToolValidationError extends RuntimeError {
  constructor(
    message: string,
    /** Name of the tool whose arguments were invalid. */
    public readonly toolName: string,
    /** Optional structured validation errors for individual argument paths. */
    public readonly errors?: Array<{
      path: string;
      message: string;
    }>,
  ) {
    super(message, "TOOL_VALIDATION_ERROR");
    this.name = "ToolValidationError";
  }
}

/** Error raised when a requested provider has not been registered. */
export class ProviderNotFoundError extends RuntimeError {
  constructor(
    /** Provider name that could not be resolved. */
    public readonly providerName: string,
  ) {
    super(`LLM Provider not found: ${providerName}`, "PROVIDER_NOT_FOUND");
    this.name = "ProviderNotFoundError";
  }
}

/** Error raised when the runtime cannot find a tool referenced by the model. */
export class ToolNotFoundError extends RuntimeError {
  constructor(
    /** Tool name that could not be resolved. */
    public readonly toolName: string,
  ) {
    super(`Tool not found: ${toolName}`, "TOOL_NOT_FOUND");
    this.name = "ToolNotFoundError";
  }
}

/** Error raised when execution is cancelled by the caller or runtime. */
export class AbortedError extends RuntimeError {
  constructor(message: string = "Execution was aborted") {
    super(message, "ABORTED");
    this.name = "AbortedError";
  }
}
