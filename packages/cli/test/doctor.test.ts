/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runDoctorChecks } from "../src/commands/doctor.js";

// ── Mock @agentrail/app so we don't need a real config file on disk ────────────

vi.mock("@agentrail/app", async () => {
  const actual = await vi.importActual<typeof import("@agentrail/app")>("@agentrail/app");
  return {
    ...actual,
    loadAgentrailConfig: vi.fn(),
  };
});

import { loadAgentrailConfig } from "@agentrail/app";
const mockLoad = vi.mocked(loadAgentrailConfig);

// ── Minimal valid config shape expected by runDoctorChecks ─────────────────────

const minimalConfig = {
  llm: { provider: "openai" },
  paths: {},
};

describe("runDoctorChecks – config loading", () => {
  beforeEach(() => {
    mockLoad.mockReset();
  });

  it("returns a config:ok result when loadAgentrailConfig succeeds", async () => {
    mockLoad.mockReturnValue(minimalConfig as never);

    const results = await runDoctorChecks({});

    expect(mockLoad).toHaveBeenCalledOnce();
    expect(mockLoad).toHaveBeenCalledWith({});
    const configResult = results.find((r) => r.name === "config");
    expect(configResult?.status).toBe("ok");
  });

  it("passes an options object — not a raw string — to loadAgentrailConfig", async () => {
    mockLoad.mockReturnValue(minimalConfig as never);

    await runDoctorChecks({ configPath: "/custom/agentrail.yaml" });

    // Must call with an object containing `configPath`, never a plain string.
    expect(mockLoad).toHaveBeenCalledWith({ configPath: "/custom/agentrail.yaml" });
    const [arg] = mockLoad.mock.calls[0];
    expect(typeof arg).toBe("object");
    expect(arg).toHaveProperty("configPath", "/custom/agentrail.yaml");
  });

  it("passes an empty options object when no configPath is provided", async () => {
    mockLoad.mockReturnValue(minimalConfig as never);

    await runDoctorChecks({});

    expect(mockLoad).toHaveBeenCalledWith({});
  });

  it("records a config:fail result and returns early when loading throws", async () => {
    mockLoad.mockImplementation(() => {
      throw new Error("file not found");
    });

    const results = await runDoctorChecks({ configPath: "/nonexistent.yaml" });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("fail");
    expect(results[0].message).toMatch(/file not found/);
  });
});
