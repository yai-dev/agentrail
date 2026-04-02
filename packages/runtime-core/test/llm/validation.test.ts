/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { ToolValidationError } from "../../src/errors.js";
import { validateToolArguments, validateToolCall } from "../../src/llm/utils/validation.js";
import type { ToolCall } from "../../src/types/content.types.js";
import type { ToolDefinition } from "../../src/types/tool.types.js";

const stringTool: ToolDefinition = {
  name: "string_tool",
  description: "A tool that accepts a string name",
  parameters: Type.Object({
    name: Type.String(),
  }),
};

const numericTool: ToolDefinition = {
  name: "numeric_tool",
  description: "A tool that accepts a number",
  parameters: Type.Object({
    count: Type.Number(),
  }),
};

function makeToolCall(toolName: string, args: Record<string, unknown>): ToolCall {
  return {
    type: "toolCall",
    id: "call-001",
    name: toolName,
    arguments: args,
  };
}

describe("validateToolArguments", () => {
  it("should return arguments when they are valid", () => {
    const toolCall = makeToolCall("string_tool", { name: "hello" });
    const result = validateToolArguments(stringTool, toolCall);

    expect(result).toEqual({ name: "hello" });
  });

  it("should throw ToolValidationError when a required property has the wrong type", () => {
    const toolCall = makeToolCall("string_tool", { name: 123 });

    expect(() => validateToolArguments(stringTool, toolCall)).toThrow(ToolValidationError);
  });

  it("should include error details in ToolValidationError", () => {
    const toolCall = makeToolCall("string_tool", { name: 123 });

    try {
      validateToolArguments(stringTool, toolCall);
      expect.fail("Should have thrown ToolValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolValidationError);
      const validationError = error as ToolValidationError;
      expect(validationError.toolName).toBe("string_tool");
      expect(validationError.errors).toBeDefined();
      expect(validationError.errors!.length).toBeGreaterThan(0);
    }
  });

  it("should include the tool name in ToolValidationError", () => {
    const toolCall = makeToolCall("string_tool", { name: false });

    expect(() => validateToolArguments(stringTool, toolCall)).toThrow(
      expect.objectContaining({ toolName: "string_tool" }),
    );
  });

  it("should validate numeric type correctly", () => {
    const toolCall = makeToolCall("numeric_tool", { count: 42 });
    const result = validateToolArguments(numericTool, toolCall);

    expect(result).toEqual({ count: 42 });
  });

  it("should throw for numeric tool when argument is a string", () => {
    const toolCall = makeToolCall("numeric_tool", { count: "not-a-number" });

    expect(() => validateToolArguments(numericTool, toolCall)).toThrow(ToolValidationError);
  });
});

describe("validateToolCall", () => {
  it("should return validated arguments when tool is found and arguments are valid", () => {
    const toolCall = makeToolCall("string_tool", { name: "hello" });
    const result = validateToolCall([stringTool], toolCall);

    expect(result).toEqual({ name: "hello" });
  });

  it("should throw ToolValidationError when tool is not found in the list", () => {
    const toolCall = makeToolCall("unknown_tool", { name: "hello" });

    expect(() => validateToolCall([stringTool], toolCall)).toThrow(ToolValidationError);
  });

  it("should include the missing tool name in the error when tool not found", () => {
    const toolCall = makeToolCall("missing_tool", {});

    expect(() => validateToolCall([stringTool], toolCall)).toThrow(
      expect.objectContaining({ toolName: "missing_tool" }),
    );
  });

  it("should throw for invalid arguments even when tool is found", () => {
    const toolCall = makeToolCall("string_tool", { name: 99 });

    expect(() => validateToolCall([stringTool], toolCall)).toThrow(ToolValidationError);
  });

  it("should find the correct tool in a list with multiple tools", () => {
    const toolCall = makeToolCall("numeric_tool", { count: 5 });
    const result = validateToolCall([stringTool, numericTool], toolCall);

    expect(result).toEqual({ count: 5 });
  });
});
