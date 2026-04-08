/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { LlmProviderRegistry } from "@/llm/llm-provider-registry.js";
import { OpenAiLlmProvider } from "@/llm/providers/openai-llm-provider.js";

LlmProviderRegistry.getInstance().register(new OpenAiLlmProvider());

export { OpenAiLlmProvider } from "@/llm/providers/openai-llm-provider.js";
