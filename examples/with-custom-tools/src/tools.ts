/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type, defineSimpleTool, defineTool } from "@agentrail/core";

/**
 * A no-parameter tool defined with `defineSimpleTool`.
 * Returns the current date and time in ISO 8601 format.
 */
export const getCurrentTimeTool = defineSimpleTool({
  name: "get-current-time",
  description: "Returns the current UTC date and time in ISO 8601 format.",
  async execute() {
    const now = new Date().toISOString();
    return { content: [{ type: "text" as const, text: now }], details: undefined };
  },
});

/**
 * A parameterised tool defined with `defineTool` and a TypeBox schema.
 * Evaluates simple arithmetic expressions (addition, subtraction, multiplication, division).
 *
 * Only numeric literals and the four basic operators are permitted so that
 * arbitrary code execution is not possible.
 */
export const calculateTool = defineTool({
  name: "calculate",
  description:
    "Evaluates a simple arithmetic expression containing numbers and the operators +, -, *, /. " +
    'Example: "3 * (2 + 4)".',
  parameters: Type.Object({
    expression: Type.String({
      description: 'The arithmetic expression to evaluate, e.g. "2 + 2" or "10 / (3 - 1)".',
    }),
  }),
  async execute({ expression }) {
    // Allow only digits, whitespace, and basic arithmetic operators / parentheses.
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: expression contains disallowed characters: ${expression}`,
          },
        ],
        details: undefined,
      };
    }

    try {
      // Safe to use Function here because we validated the expression above.
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${expression});`)() as number;
      if (typeof result !== "number" || !isFinite(result)) {
        return {
          content: [{ type: "text" as const, text: "Error: result is not a finite number" }],
          details: undefined,
        };
      }
      return { content: [{ type: "text" as const, text: String(result) }], details: undefined };
    } catch {
      return {
        content: [
          { type: "text" as const, text: `Error: could not evaluate expression: ${expression}` },
        ],
        details: undefined,
      };
    }
  },
});
