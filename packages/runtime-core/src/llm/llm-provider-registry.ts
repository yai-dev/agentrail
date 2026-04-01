/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import { ProviderNotFoundError } from "../errors.js";
import type { LlmProvider } from "../interfaces/llm-client.js";

export class LlmProviderRegistry {
	private static instance: LlmProviderRegistry | null = null;
	private providers: Map<string, LlmProvider> = new Map();

	constructor() {}

	static getInstance(): LlmProviderRegistry {
		if (!LlmProviderRegistry.instance) {
			LlmProviderRegistry.instance = new LlmProviderRegistry();
		}
		return LlmProviderRegistry.instance;
	}

	static resetInstance(): void {
		LlmProviderRegistry.instance = null;
	}

	register(provider: LlmProvider): void {
		if (this.providers.has(provider.provider)) {
			console.warn(`Provider "${provider.provider}" is already registered. Overwriting.`);
		}
		this.providers.set(provider.provider, provider);
	}

	resolve(providerName: string): LlmProvider {
		const provider = this.providers.get(providerName);
		if (!provider) {
			throw new ProviderNotFoundError(providerName);
		}
		return provider;
	}

	listAll(): LlmProvider[] {
		return Array.from(this.providers.values());
	}

	has(providerName: string): boolean {
		return this.providers.has(providerName);
	}
}
