/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, expect, it } from "vitest";
import { getDeepResearchConfig, parseAgentrailConfig } from "../src/config/index.js";

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
