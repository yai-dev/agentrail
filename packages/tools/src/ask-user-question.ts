/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Type } from "@sinclair/typebox";
import { tool } from "@agentrail/runtime-core";

// ============================================================================
// ============================================================================

export interface WaitHandleRegistry {
  register(sessionId: string, question: string): Promise<string>;
}

// ============================================================================
// ============================================================================

export function createAskUserQuestionTool(sessionId: string, registry: WaitHandleRegistry) {
  return tool()
    .name("AskUserQuestion")
    .label("询问用户")
    .description(
      `Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take

Usage notes:
- When \`custom\` is true (default), a "Type your own answer" option is added automatically; don't include "Other" or catch-all options in \`options\`
- When \`multiple\` is true, the user can select more than one option; answers are returned comma-separated
- If you recommend a specific option, make that the first option in the list and append " (Recommended)" to its label
- Omit \`options\` for open-ended questions that require free-form text`,
    )
    .parameters(
      Type.Object({
        question: Type.String({
          description: "The question to present to the user. Be specific and concise.",
        }),
        hint: Type.Optional(
          Type.String({
            description:
              "Optional hint shown below the question (e.g. expected format, constraints). Omit when options are provided.",
          }),
        ),
        options: Type.Optional(
          Type.Array(Type.String(), {
            description:
              "Predefined choices rendered as clickable buttons. " +
              'If you recommend one, put it first and append " (Recommended)" to its label. ' +
              "Do NOT include an 'Other' option — set custom:true instead.",
          }),
        ),
        multiple: Type.Optional(
          Type.Boolean({
            description: "Allow the user to select more than one option. Defaults to false.",
          }),
        ),
        custom: Type.Optional(
          Type.Boolean({
            description: "Add a 'Type your own answer' entry automatically. Defaults to true.",
          }),
        ),
      }),
    )
    .execute(async ({ question, hint, options, multiple = false, custom = true }, ctx) => {
      ctx.onSignal?.({
        type: "waiting_for_input",
        question,
        hint,
        options,
        multiple,
        custom,
      });

      const answer = await Promise.race([
        registry.register(sessionId, question),
        new Promise<never>((_resolve, reject) => {
          ctx.signal?.addEventListener("abort", () =>
            reject(new Error("Request aborted while waiting for user input")),
          );
        }),
      ]);

      return {
        content: [{ type: "text" as const, text: answer }],
        details: { question, answer },
      };
    })
    .build();
}
