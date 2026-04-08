/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect } from "vitest";
import { Type } from "@sinclair/typebox";
import { defineTool } from "../src/tools/define-tool.js";

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
});
