/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import { describe, it, expect } from "vitest";
import {
	RuntimeError,
	LlmError,
	ToolExecutionError,
	ToolValidationError,
	ProviderNotFoundError,
	ToolNotFoundError,
	AbortedError,
} from "../src/errors.js";

describe("RuntimeError", () => {
	it("should set message, code, and cause correctly", () => {
		const cause = new Error("original");
		const error = new RuntimeError("something failed", "ERR_CODE", cause);

		expect(error.message).toBe("something failed");
		expect(error.code).toBe("ERR_CODE");
		expect(error.cause).toBe(cause);
		expect(error.name).toBe("RuntimeError");
	});

	it("should extend Error", () => {
		const error = new RuntimeError("msg", "CODE");
		expect(error).toBeInstanceOf(Error);
	});

	it("should work without cause", () => {
		const error = new RuntimeError("msg", "CODE");
		expect(error.cause).toBeUndefined();
	});
});

describe("LlmError", () => {
	it("should set provider, modelId, and code", () => {
		const error = new LlmError("llm failed", "anthropic", "claude-3-5-sonnet");

		expect(error.provider).toBe("anthropic");
		expect(error.modelId).toBe("claude-3-5-sonnet");
		expect(error.code).toBe("LLM_ERROR");
		expect(error.name).toBe("LlmError");
	});

	it("should extend RuntimeError", () => {
		const error = new LlmError("msg", "openai");
		expect(error).toBeInstanceOf(RuntimeError);
	});

	it("should work without modelId", () => {
		const error = new LlmError("msg", "openai");
		expect(error.modelId).toBeUndefined();
	});
});

describe("ToolExecutionError", () => {
	it("should set toolName, toolCallId, and code", () => {
		const error = new ToolExecutionError("exec failed", "my_tool", "call-123");

		expect(error.toolName).toBe("my_tool");
		expect(error.toolCallId).toBe("call-123");
		expect(error.code).toBe("TOOL_EXECUTION_ERROR");
		expect(error.name).toBe("ToolExecutionError");
	});

	it("should extend RuntimeError", () => {
		const error = new ToolExecutionError("msg", "tool", "id");
		expect(error).toBeInstanceOf(RuntimeError);
	});
});

describe("ToolValidationError", () => {
	it("should set toolName, errors, and code", () => {
		const errors = [{ path: "/name", message: "required" }];
		const error = new ToolValidationError("validation failed", "my_tool", errors);

		expect(error.toolName).toBe("my_tool");
		expect(error.errors).toEqual(errors);
		expect(error.code).toBe("TOOL_VALIDATION_ERROR");
		expect(error.name).toBe("ToolValidationError");
	});

	it("should work without errors array", () => {
		const error = new ToolValidationError("msg", "my_tool");
		expect(error.errors).toBeUndefined();
	});

	it("should extend RuntimeError", () => {
		const error = new ToolValidationError("msg", "tool");
		expect(error).toBeInstanceOf(RuntimeError);
	});
});

describe("ProviderNotFoundError", () => {
	it("should include providerName in message and expose it as property", () => {
		const error = new ProviderNotFoundError("unknown-provider");

		expect(error.providerName).toBe("unknown-provider");
		expect(error.message).toContain("unknown-provider");
		expect(error.code).toBe("PROVIDER_NOT_FOUND");
		expect(error.name).toBe("ProviderNotFoundError");
	});

	it("should extend RuntimeError", () => {
		const error = new ProviderNotFoundError("x");
		expect(error).toBeInstanceOf(RuntimeError);
	});
});

describe("ToolNotFoundError", () => {
	it("should include toolName in message and expose it as property", () => {
		const error = new ToolNotFoundError("my_missing_tool");

		expect(error.toolName).toBe("my_missing_tool");
		expect(error.message).toContain("my_missing_tool");
		expect(error.code).toBe("TOOL_NOT_FOUND");
		expect(error.name).toBe("ToolNotFoundError");
	});

	it("should extend RuntimeError", () => {
		const error = new ToolNotFoundError("x");
		expect(error).toBeInstanceOf(RuntimeError);
	});
});

describe("AbortedError", () => {
	it("should have default message and code", () => {
		const error = new AbortedError();

		expect(error.message).toBe("Execution was aborted");
		expect(error.code).toBe("ABORTED");
		expect(error.name).toBe("AbortedError");
	});

	it("should accept a custom message", () => {
		const error = new AbortedError("Custom abort reason");
		expect(error.message).toBe("Custom abort reason");
	});

	it("should extend RuntimeError", () => {
		const error = new AbortedError();
		expect(error).toBeInstanceOf(RuntimeError);
	});
});
