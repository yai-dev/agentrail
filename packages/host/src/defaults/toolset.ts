/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { RuntimeTool } from "@agentrail/runtime-core";
import type {
  DefaultContextProvidersInput,
  DefaultToolsetInput,
} from "./shared-types.js";
import type { ContextProvider } from "../types.js";

/**
 * Merges base and optional context providers into a single ordered list.
 */
export function createDefaultContextProviders(
  input: DefaultContextProvidersInput = {},
): ContextProvider[] {
  return [
    ...(input.baseProviders ?? []),
    ...(input.optionalProviders ?? []).filter(
      (provider): provider is ContextProvider => Boolean(provider),
    ),
  ];
}

/**
 * Assembles the recommended default tool list for a hosted profile.
 */
export function createDefaultToolset(
  input: DefaultToolsetInput,
): RuntimeTool[] {
  return [
    ...(input.executionTools ?? []),
    ...(input.browserTools ?? []),
    ...(input.orchestrationTools ?? []),
    ...(input.capabilityTools ?? []),
    ...(input.optionalTools ?? []).filter(
      (tool): tool is RuntimeTool => Boolean(tool),
    ),
  ];
}

/**
 * Returns a binding unchanged while keeping the recommended-SDK API explicit.
 */
export function createDefaultOrchestrationBinding<T>(binding: T): T {
  return binding;
}
