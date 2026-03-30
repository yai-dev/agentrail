/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import { describe, it, expect, beforeEach, vi } from "vitest";
import { LlmProviderRegistry } from "../../src/llm/llm-provider-registry.js";
import type { LlmProvider, LlmRequest } from "../../src/interfaces/llm-client.js";
import { ProviderNotFoundError } from "../../src/errors.js";

function createMockProvider(providerName: string): LlmProvider {
	return {
		provider: providerName,
		stream: (_request: LlmRequest) => {
			throw new Error("not implemented");
		},
	};
}

describe("LlmProviderRegistry", () => {
	beforeEach(() => {
		LlmProviderRegistry.resetInstance();
	});

	it("should return the same singleton instance", () => {
		const instance1 = LlmProviderRegistry.getInstance();
		const instance2 = LlmProviderRegistry.getInstance();

		expect(instance1).toBe(instance2);
	});

	it("should create a new instance after resetInstance", () => {
		const instance1 = LlmProviderRegistry.getInstance();
		LlmProviderRegistry.resetInstance();
		const instance2 = LlmProviderRegistry.getInstance();

		expect(instance1).not.toBe(instance2);
	});

	it("should register and resolve a provider by name", () => {
		const registry = LlmProviderRegistry.getInstance();
		const provider = createMockProvider("anthropic");

		registry.register(provider);

		expect(registry.resolve("anthropic")).toBe(provider);
	});

	it("should throw ProviderNotFoundError when resolving an unregistered provider", () => {
		const registry = LlmProviderRegistry.getInstance();

		expect(() => registry.resolve("nonexistent")).toThrow(ProviderNotFoundError);
	});

	it("should throw ProviderNotFoundError with the provider name in the error", () => {
		const registry = LlmProviderRegistry.getInstance();

		expect(() => registry.resolve("openai")).toThrow(
			expect.objectContaining({ providerName: "openai" }),
		);
	});

	it("should list all registered providers", () => {
		const registry = LlmProviderRegistry.getInstance();
		const anthropic = createMockProvider("anthropic");
		const openai = createMockProvider("openai");

		registry.register(anthropic);
		registry.register(openai);

		const all = registry.listAll();
		expect(all).toHaveLength(2);
		expect(all).toContain(anthropic);
		expect(all).toContain(openai);
	});

	it("should return empty list when no providers are registered", () => {
		const registry = LlmProviderRegistry.getInstance();
		expect(registry.listAll()).toHaveLength(0);
	});

	it("should return true for has() when provider is registered", () => {
		const registry = LlmProviderRegistry.getInstance();
		registry.register(createMockProvider("anthropic"));

		expect(registry.has("anthropic")).toBe(true);
	});

	it("should return false for has() when provider is not registered", () => {
		const registry = LlmProviderRegistry.getInstance();

		expect(registry.has("anthropic")).toBe(false);
	});

	it("should warn when overwriting an already-registered provider", () => {
		const registry = LlmProviderRegistry.getInstance();
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		registry.register(createMockProvider("anthropic"));
		registry.register(createMockProvider("anthropic"));

		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("anthropic"));
		consoleSpy.mockRestore();
	});

	it("should overwrite with the new provider when re-registering", () => {
		const registry = LlmProviderRegistry.getInstance();
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const provider1 = createMockProvider("anthropic");
		const provider2 = createMockProvider("anthropic");

		registry.register(provider1);
		registry.register(provider2);

		expect(registry.resolve("anthropic")).toBe(provider2);
		vi.restoreAllMocks();
	});
});
