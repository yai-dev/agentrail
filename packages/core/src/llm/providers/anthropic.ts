/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { LlmProviderRegistry } from "../llm-provider-registry.js";
import { AnthropicLlmProvider } from "./anthropic-llm-provider.js";

LlmProviderRegistry.getInstance().register(new AnthropicLlmProvider());

export { AnthropicLlmProvider } from "./anthropic-llm-provider.js";
