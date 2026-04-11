/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect } from "vitest";
import { Type } from "@sinclair/typebox";
import { validateToolInput } from "../src/llm/utils/validation.js";
import { ToolValidationError } from "../src/errors.js";

const schema = Type.Object({
  name: Type.String(),
  age: Type.Number({ minimum: 0 }),
});

const tool = { name: "profile", description: "", parameters: schema };

describe("validateToolInput", () => {
  it("returns the input unchanged when it matches the schema", () => {
    const input = { name: "Alice", age: 30 };
    expect(validateToolInput(tool, input)).toBe(input);
  });

  it("throws ToolValidationError when required field is missing", () => {
    expect(() => validateToolInput(tool, { age: 25 })).toThrow(ToolValidationError);
  });

  it("throws ToolValidationError when field type is wrong", () => {
    expect(() => validateToolInput(tool, { name: "Bob", age: "old" })).toThrow(ToolValidationError);
  });

  it("error message includes the tool name", () => {
    expect(() => validateToolInput(tool, { age: 1 })).toThrow(ToolValidationError);
    let caught: ToolValidationError | undefined;
    try {
      validateToolInput(tool, { age: 1 });
    } catch (e) {
      caught = e as ToolValidationError;
    }
    expect(caught!.message).toContain("profile");
  });

  it("errors array contains path and message for each violation", () => {
    // Two violations: missing name (undefined fails string check) and age is a string.
    expect(() => validateToolInput(tool, { age: "not-a-number" })).toThrow(ToolValidationError);
    let caught: ToolValidationError | undefined;
    try {
      validateToolInput(tool, { age: "not-a-number" });
    } catch (e) {
      caught = e as ToolValidationError;
    }
    const errors = caught!.errors!;
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(typeof error.path).toBe("string");
      expect(typeof error.message).toBe("string");
      expect(error.message.length).toBeGreaterThan(0);
    }
    expect(errors.some((e) => e.path.includes("age"))).toBe(true);
  });

  it("violating minimum constraint produces an error with the correct path", () => {
    expect(() => validateToolInput(tool, { name: "Charlie", age: -1 })).toThrow(ToolValidationError);
    let caught: ToolValidationError | undefined;
    try {
      validateToolInput(tool, { name: "Charlie", age: -1 });
    } catch (e) {
      caught = e as ToolValidationError;
    }
    expect(caught!.errors!.some((e) => e.path.includes("age"))).toBe(true);
  });
});
