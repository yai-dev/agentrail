import type { AgentResult, ToolCall } from "@agentrail/core";
import assert from "node:assert";

/** Collects all tool calls across every assistant turn in the result. */
function collectAllToolCalls(result: AgentResult): ToolCall[] {
  return result.messages.flatMap((msg) => {
    if (msg.role !== "assistant") return [];
    return msg.content.filter((b): b is ToolCall => b.type === "toolCall");
  });
}

export function assertToolCalled(result: AgentResult, toolName: string) {
  const allCalls = collectAllToolCalls(result);
  const called = allCalls.some((tc) => tc.name === toolName);
  assert(called, `Expected tool "${toolName}" to be called.`);
}

export function assertToolCalledWith(
  result: AgentResult,
  toolName: string,
  args: Record<string, unknown>,
) {
  const allCalls = collectAllToolCalls(result);
  const calls = allCalls.filter((tc) => tc.name === toolName);
  assert(calls.length > 0, `Expected tool "${toolName}" to be called.`);

  const match = calls.some((tc) => {
    try {
      assert.deepStrictEqual(tc.arguments, args);
      return true;
    } catch {
      return false;
    }
  });

  assert(match, `Expected tool "${toolName}" to be called with ${JSON.stringify(args)}`);
}

export function assertFinalText(result: AgentResult, expected: string | RegExp) {
  const text = result.text;
  if (expected instanceof RegExp) {
    assert(
      expected.test(text),
      `Expected final text to match pattern ${expected}, but got: "${text}"`,
    );
  } else {
    assert(
      text.includes(expected),
      `Expected final text to contain "${expected}", but got: "${text}"`,
    );
  }
}
