/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createPromptBuilder, definePromptBundle, definePromptFragment } from "@agentrail/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "prompts");

const dateFragment = definePromptFragment({
  key: "current-date",
  content: "Current date: ${CURRENT_DATE}",
});

function createRolePromptBuilder(filename: string) {
  return createPromptBuilder(
    definePromptBundle({
      base: {
        fragments: [
          definePromptFragment({
            key: filename,
            filePath: join(PROMPTS_DIR, filename),
          }),
        ],
      },
      mode: {
        fragments: [dateFragment],
      },
    }),
  );
}

const plannerPromptBuilder = createRolePromptBuilder("deep-research-planner.md");
const reporterPromptBuilder = createRolePromptBuilder("deep-research-reporter.md");
const rolePromptBuilders = {
  researcher: createRolePromptBuilder("deep-research-researcher.md"),
  analyst: createRolePromptBuilder("deep-research-analyst.md"),
  coder: createRolePromptBuilder("deep-research-coder.md"),
} as const;

export function getPlannerPrompt(currentDate: string): string {
  return plannerPromptBuilder.render({
    vars: { CURRENT_DATE: currentDate },
  });
}

export function getRolePrompt(
  role: "researcher" | "analyst" | "coder",
  currentDate: string,
): string {
  return rolePromptBuilders[role].render({
    vars: { CURRENT_DATE: currentDate },
  });
}

export function getReporterPrompt(currentDate: string): string {
  return reporterPromptBuilder.render({
    vars: { CURRENT_DATE: currentDate },
  });
}
