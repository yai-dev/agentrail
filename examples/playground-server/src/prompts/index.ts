/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import {
  createPromptBuilder,
  definePromptBundle,
  definePromptFragment,
  type PromptVars,
} from "@agentrail/prompts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROMPT_FILES = [
  "system-prompt-identity.md",
  "system-prompt-user-identity.md",
  "system-prompt-agentrail-domain.md",
  "system-prompt-behavior.md",
  "system-prompt-memory.md",
  "system-prompt-knowledge.md",
  "system-prompt-skills.md",
] as const;

const systemPromptBuilder = createPromptBuilder(
  definePromptBundle({
    base: {
      fragments: PROMPT_FILES.map((filename) =>
        definePromptFragment({
          key: filename,
          filePath: join(__dirname, filename),
          stripMetadata: true,
        }),
      ),
    },
  }),
);

export type { PromptVars };

export function buildSystemPrompt(vars: PromptVars = {}): string {
  return systemPromptBuilder.render({ vars });
}

export function clearPromptCache(): void {
  systemPromptBuilder.clearCache();
}
