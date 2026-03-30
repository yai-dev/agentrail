/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  clearPromptFileCache,
  createPromptBuilder,
  definePromptBundle,
  definePromptFragment,
  loadPromptFile,
  renderPrompt,
} from "../src/index.js";

describe("@agentrail/prompts", () => {
  it("loads prompt files, strips metadata, and interpolates variables", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "agentrail-prompts-"));
    const promptPath = path.join(tempDir, "system.md");
    writeFileSync(
      promptPath,
      "<!-- meta -->\nHello ${NAME}",
      "utf8",
    );

    expect(
      loadPromptFile(promptPath, {
        vars: { NAME: "Agentrail" },
      }),
    ).toBe("Hello Agentrail");

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("invalidates cached prompt files when the mtime changes", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "agentrail-prompts-"));
    const promptPath = path.join(tempDir, "system.md");
    writeFileSync(promptPath, "Version 1", "utf8");

    expect(loadPromptFile(promptPath)).toBe("Version 1");

    const nextMtime = new Date(statSync(promptPath).mtimeMs + 1000);
    writeFileSync(promptPath, "Version 2", "utf8");
    utimesSync(promptPath, nextMtime, nextMtime);

    expect(loadPromptFile(promptPath)).toBe("Version 2");

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("supports direct prompt rendering", () => {
    expect(renderPrompt("Today is ${DAY}", { DAY: "Monday" })).toBe(
      "Today is Monday",
    );
  });

  it("renders layered bundles with replacement and overlay support", () => {
    const bundle = definePromptBundle({
      vars: { PRODUCT: "Agentrail" },
      base: {
        fragments: [
          definePromptFragment({
            key: "identity",
            content: "You are ${PRODUCT}.",
          }),
          definePromptFragment({
            key: "behavior",
            content: "Be concise.",
          }),
        ],
      },
      profile: {
        fragments: [
          definePromptFragment({
            key: "profile",
            content: "Use the playground profile.",
          }),
        ],
      },
    });
    const builder = createPromptBuilder(bundle);

    expect(
      builder.render({
        overlay: {
          profile: {
            replace: {
              profile: definePromptFragment({
                key: "profile",
                content: "Use the research profile.",
              }),
            },
          },
          mode: {
            fragments: [
              definePromptFragment({
                key: "mode",
                content: "Current date: ${CURRENT_DATE}",
              }),
            ],
          },
        },
        vars: {
          CURRENT_DATE: "2026-03-29",
        },
      }),
    ).toBe(
      [
        "You are Agentrail.",
        "Be concise.",
        "Use the research profile.",
        "Current date: 2026-03-29",
      ].join("\n\n"),
    );
  });

  it("supports whole-bundle replacement and explicit cache clearing", () => {
    clearPromptFileCache();
    const builder = createPromptBuilder(
      definePromptBundle({
        base: {
          fragments: [
            definePromptFragment({
              key: "base",
              content: "base bundle",
            }),
          ],
        },
      }),
    );

    expect(
      builder.render({
        bundle: definePromptBundle({
          base: {
            fragments: [
              definePromptFragment({
                key: "base",
                content: "replacement bundle",
              }),
            ],
          },
        }),
      }),
    ).toBe("replacement bundle");

    builder.clearCache();
  });
});
