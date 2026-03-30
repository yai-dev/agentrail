/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_AGENTRAIL_CONFIG,
  loadAgentrailConfig,
  parseAgentrailConfig,
  resolveAgentrailConfigPath,
} from "../src/index.js";

describe("@agentrail/config", () => {
  const originalPath = process.env.AGENTRAIL_CONFIG_PATH;

  afterEach(() => {
    process.env.AGENTRAIL_CONFIG_PATH = originalPath;
  });

  function createTempConfig(content: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentrail-config-"));
    mkdirSync(path.join(dir, "config"), { recursive: true });
    const configPath = path.join(dir, "config", "agentrail.yaml");
    writeFileSync(configPath, content, "utf8");
    return configPath;
  }

  it("parses valid config and applies defaults", () => {
    const parsed = parseAgentrailConfig({
      version: 1,
      llm: {
        provider: "openai",
        modelId: "gpt-4.1",
      },
    });

    expect(parsed.llm.provider).toBe("openai");
    expect(parsed.llm.modelId).toBe("gpt-4.1");
    expect(parsed.sandbox.image).toBe(DEFAULT_AGENTRAIL_CONFIG.sandbox.image);
    expect(parsed.apps.playgroundUi.port).toBe(DEFAULT_AGENTRAIL_CONFIG.apps.playgroundUi.port);
  });

  it("rejects unknown fields", () => {
    expect(() =>
      parseAgentrailConfig({
        version: 1,
        llm: {
          provider: "anthropic",
          modelId: "claude-sonnet-4-5",
          extra: true,
        },
      }),
    ).toThrow(/llm\.extra/);
  });

  it("rejects invalid version", () => {
    expect(() => parseAgentrailConfig({ version: 2 })).toThrow(/version to be 1/);
  });

  it("rejects invalid field types with field paths", () => {
    expect(() =>
      parseAgentrailConfig({
        version: 1,
        sandbox: {
          idleTimeoutMs: "fast",
        },
      }),
    ).toThrow(/sandbox\.idleTimeoutMs/);
  });

  it("loads yaml from an explicit path", () => {
    const configPath = createTempConfig(`
version: 1
llm:
  provider: anthropic
  modelId: claude-sonnet-4-5
apps:
  playgroundUi:
    port: 4173
    backendPort: 4000
`);

    const config = loadAgentrailConfig({ configPath });
    expect(config.apps.playgroundUi.port).toBe(4173);
    expect(config.apps.playgroundUi.backendPort).toBe(4000);
  });

  it("resolves config path through AGENTRAIL_CONFIG_PATH", () => {
    const configPath = createTempConfig("version: 1\n");
    process.env.AGENTRAIL_CONFIG_PATH = configPath;

    expect(resolveAgentrailConfigPath()).toBe(configPath);
  });
});
