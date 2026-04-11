/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect, vi } from "vitest";
import { Type } from "@sinclair/typebox";
import { defineTool } from "../src/tools/define-tool.js";
import { defineSimpleTool } from "../src/tools/tool-builder.js";
import type { ToolValidationContext } from "../src/types/tool.types.js";

describe("defineTool", () => {
  it("creates a RuntimeTool with the correct name and description", () => {
    const t = defineTool({
      name: "greet",
      description: "Greets the user",
      async execute() {
        return { content: [{ type: "text" as const, text: "hi" }] };
      },
    });
    expect(t.name).toBe("greet");
    expect(t.description).toBe("Greets the user");
  });

  it("uses name as label when no label is provided", () => {
    const t = defineTool({
      name: "my_tool",
      description: "A tool",
      async execute() {
        return { content: [] };
      },
    });
    expect(t.label).toBe("my_tool");
  });

  it("uses the provided label", () => {
    const t = defineTool({
      name: "my_tool",
      label: "My Tool",
      description: "A tool",
      async execute() {
        return { content: [] };
      },
    });
    expect(t.label).toBe("My Tool");
  });

  it("defaults to an empty object schema when parameters is omitted", () => {
    const t = defineTool({
      name: "no_params",
      description: "No params",
      async execute() {
        return { content: [] };
      },
    });
    // Schema should exist (defaults to Type.Object({}))
    expect(t.parameters).toBeDefined();
  });

  it("accepts a TypeBox parameters schema and passes it through", () => {
    const schema = Type.Object({ city: Type.String() });
    const t = defineTool({
      name: "weather",
      description: "Get weather",
      parameters: schema,
      async execute({ city }) {
        return { content: [{ type: "text" as const, text: city }] };
      },
    });
    expect(t.parameters).toBe(schema);
  });

  it("calls the execute function correctly", async () => {
    const t = defineTool({
      name: "echo",
      description: "Echoes input",
      parameters: Type.Object({ msg: Type.String() }),
      async execute({ msg }) {
        return { content: [{ type: "text" as const, text: msg }], details: { msg } };
      },
    });

    // RuntimeTool.execute signature: (toolCallId, params, signal?, onUpdate?, onSignal?)
    const result = await t.execute("test-call-id", { msg: "hello" }, undefined, () => {});
    expect(result.content[0]).toMatchObject({ type: "text", text: "hello" });
    expect((result as { details: { msg: string } }).details.msg).toBe("hello");
  });

  it("validate option is wired to RuntimeTool.validate", async () => {
    const validateFn = vi.fn().mockResolvedValue({ valid: true });
    const t = defineTool({
      name: "checked",
      description: "Checked tool",
      parameters: Type.Object({ value: Type.String() }),
      validate: validateFn,
      async execute() {
        return { content: [] };
      },
    });

    expect(typeof t.validate).toBe("function");
    const ctx: ToolValidationContext = { toolCallId: "id-1" };
    await t.validate!({ value: "x" }, ctx);
    expect(validateFn).toHaveBeenCalledOnce();
    expect(validateFn).toHaveBeenCalledWith({ value: "x" }, ctx);
  });

  it("validate option absent: RuntimeTool.validate is undefined", () => {
    const t = defineTool({
      name: "plain",
      description: "Plain tool",
      async execute() {
        return { content: [] };
      },
    });
    expect(t.validate).toBeUndefined();
  });
});

describe("defineSimpleTool", () => {
  it("creates a RuntimeTool with the correct name and description", () => {
    const t = defineSimpleTool({
      name: "ping",
      description: "Pings",
      async execute() {
        return { content: [{ type: "text" as const, text: "pong" }], details: null };
      },
    });
    expect(t.name).toBe("ping");
    expect(t.description).toBe("Pings");
  });

  it("validate option is wired to RuntimeTool.validate", async () => {
    const validateFn = vi.fn().mockResolvedValue({ valid: true });
    const t = defineSimpleTool({
      name: "safe-ping",
      description: "Safe ping",
      validate: validateFn,
      async execute() {
        return { content: [], details: null };
      },
    });

    expect(typeof t.validate).toBe("function");
    const ctx: ToolValidationContext = { toolCallId: "id-2" };
    await t.validate!({}, ctx);
    expect(validateFn).toHaveBeenCalledOnce();
    expect(validateFn).toHaveBeenCalledWith(ctx);
  });

  it("validate option absent: RuntimeTool.validate is undefined", () => {
    const t = defineSimpleTool({
      name: "simple",
      description: "Simple",
      async execute() {
        return { content: [], details: null };
      },
    });
    expect(t.validate).toBeUndefined();
  });
});
