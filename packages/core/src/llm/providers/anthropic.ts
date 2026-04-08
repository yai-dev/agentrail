/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { LlmProviderRegistry } from "@/llm/llm-provider-registry.js";
import { AnthropicLlmProvider } from "@/llm/providers/anthropic-llm-provider.js";

LlmProviderRegistry.getInstance().register(new AnthropicLlmProvider());

export { AnthropicLlmProvider } from "@/llm/providers/anthropic-llm-provider.js";
