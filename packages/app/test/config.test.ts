/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import type { AgentrailConfig } from "../src/config/index.js";
import {
  getDeepResearchConfig,
  getPlaygroundServerConfig,
  parseAgentrailConfig,
} from "../src/config/index.js";

describe("Agentrail config search settings", () => {
  it("parses brave and jina API keys", () => {
    const config = parseAgentrailConfig({
      search: {
        provider: "jina",
        braveApiKey: "brave-key",
        jinaApiKey: "jina-key",
      },
    });

    expect(config.search).toMatchObject({
      provider: "jina",
      braveApiKey: "brave-key",
      jinaApiKey: "jina-key",
    });
  });

  it("exposes brave and jina keys through resolved deep research config", () => {
    const resolved = getDeepResearchConfig(
      parseAgentrailConfig({
        search: {
          provider: "brave",
          braveApiKey: "brave-key",
          jinaApiKey: "jina-key",
        },
      }),
    );

    expect(resolved).toMatchObject({
      searchProvider: "brave",
      braveApiKey: "brave-key",
      jinaApiKey: "jina-key",
    });
  });
});

describe("parseAgentrailConfig — permissions block", () => {
  it("parses a full permissions block", () => {
    const config = parseAgentrailConfig({
      permissions: {
        mode: "default",
        allow: ["Bash(git:*)", "Bash(npm:*)"],
        deny: ["Bash(rm:*)"],
        ask: ["Write", "Edit"],
      },
    }) as AgentrailConfig;

    expect(config.permissions).toMatchObject({
      mode: "default",
      allow: ["Bash(git:*)", "Bash(npm:*)"],
      deny: ["Bash(rm:*)"],
      ask: ["Write", "Edit"],
    });
  });

  it("omitting permissions leaves the field undefined", () => {
    const config = parseAgentrailConfig({}) as AgentrailConfig;
    expect(config.permissions).toBeUndefined();
  });

  it("throws on an invalid mode value", () => {
    expect(() =>
      parseAgentrailConfig({
        permissions: { mode: "INVALID_MODE" },
      }),
    ).toThrow(/invalid.*mode/i);
  });

  it("throws on unknown permissions keys", () => {
    expect(() =>
      parseAgentrailConfig({
        permissions: { unknownKey: true },
      }),
    ).toThrow(/unknown/i);
  });

  it("parses partial permissions block (only deny)", () => {
    const config = parseAgentrailConfig({
      permissions: { deny: ["Bash"] },
    }) as AgentrailConfig;

    expect(config.permissions?.deny).toEqual(["Bash"]);
    expect(config.permissions?.allow).toEqual([]);
    expect(config.permissions?.ask).toEqual([]);
    expect(config.permissions?.mode).toBeUndefined();
  });

  it("parses permissions.mode: strict", () => {
    const config = parseAgentrailConfig({
      permissions: {
        mode: "strict",
        allow: ["Bash(git:*)", "Read"],
      },
    }) as AgentrailConfig;

    expect(config.permissions?.mode).toBe("strict");
    expect(config.permissions?.allow).toEqual(["Bash(git:*)", "Read"]);
  });
});

describe("getPlaygroundServerConfig — permissionPolicy wiring", () => {
  it("converts permissions block to permissionPolicy", () => {
    const config = parseAgentrailConfig({
      permissions: { mode: "strict", allow: ["Bash(git:*)"] },
    }) as AgentrailConfig;
    const out = getPlaygroundServerConfig(config);
    expect(out.permissionPolicy).toBeDefined();
    expect(out.permissionPolicy?.mode).toBe("strict");
    expect(out.permissionPolicy?.allow).toHaveLength(1);
    expect(out.permissionPolicy?.allow[0].toolName).toBe("Bash");
  });

  it("omits permissionPolicy when no permissions in config", () => {
    const config = parseAgentrailConfig({}) as AgentrailConfig;
    expect(getPlaygroundServerConfig(config).permissionPolicy).toBeUndefined();
  });
});
