/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Built-in LLM provider registrations.
 *
 * Import this file as a side effect to register all built-in providers
 * (Anthropic, OpenAI) into the global LlmProviderRegistry:
 *
 *   import "@agentrail/runtime-core/providers";
 */
export * from "./anthropic.js";
export * from "./openai.js";
