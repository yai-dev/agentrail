import type { AgentResult } from "@agentrail/runtime-core";
import assert from "node:assert";

export function assertToolCalled(result: AgentResult, toolName: string) {
  const called = result.toolCalls.some((tc) => tc.name === toolName);
  assert(called, `Expected tool "${toolName}" to be called.`);
}

export function assertToolCalledWith(
  result: AgentResult,
  toolName: string,
  args: Record<string, any>
) {
  const calls = result.toolCalls.filter((tc) => tc.name === toolName);
  assert(
    calls.length > 0,
    `Expected tool "${toolName}" to be called.`
  );
  
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
      `Expected final text to match pattern ${expected}, but got: "${text}"`
    );
  } else {
    assert(
      text.includes(expected),
      `Expected final text to contain "${expected}", but got: "${text}"`
    );
  }
}
