/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeTool } from "@agentrail/runtime-core";
import type { ContextProvider } from "../types.js";
import type { DefaultContextProvidersInput, DefaultToolsetInput } from "./shared-types.js";

/**
 * Merges base and optional context providers into a single ordered list.
 *
 * @see {@link https://agentrail.run/reference/host-defaults}
 */
export function createDefaultContextProviders(
  input: DefaultContextProvidersInput = {},
): ContextProvider[] {
  return [
    ...(input.baseProviders ?? []),
    ...(input.optionalProviders ?? []).filter((provider): provider is ContextProvider =>
      Boolean(provider),
    ),
  ];
}

/**
 * Assembles the recommended default tool list for a hosted profile.
 *
 * Tools are sorted alphabetically by name to ensure a stable order across
 * requests, which preserves LLM prompt cache hits (providers cache the tools
 * array as part of the prompt prefix).
 *
 * @see {@link https://agentrail.run/reference/host-defaults}
 */
export function createDefaultToolset(input: DefaultToolsetInput): RuntimeTool[] {
  const tools = [
    ...(input.executionTools ?? []),
    ...(input.browserTools ?? []),
    ...(input.orchestrationTools ?? []),
    ...(input.capabilityTools ?? []),
    ...(input.optionalTools ?? []).filter((tool): tool is RuntimeTool => Boolean(tool)),
  ];
  return tools.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/**
 * Returns a binding unchanged while keeping the recommended-SDK API explicit.
 *
 * @see {@link https://agentrail.run/reference/host-defaults}
 */
export function createDefaultOrchestrationBinding<T>(binding: T): T {
  return binding;
}
