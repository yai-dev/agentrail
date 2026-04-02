/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { describe, it, expect, vi } from "vitest";
import { defineAgent } from "../../src/agent/define-agent.js";
import { MockLlmClient } from "../mocks/MockLlmClient.js";

describe("defineAgent", () => {
	it("uses the injected llmClient instead of the global registry", async () => {
		const mockClient = new MockLlmClient();
		const streamSpy = vi.spyOn(mockClient, "stream");

		const agent = defineAgent({
			id: "test-agent",
			system: "You are a test agent.",
			model: "mock:mock-model",
			llmClient: mockClient,
		});

		await agent.invoke("hello");

		expect(streamSpy).toHaveBeenCalledTimes(1);
	});

	it("passes the correct request to the injected llmClient", async () => {
		const mockClient = new MockLlmClient();
		let capturedRequest: unknown = null;
		const original = mockClient.stream.bind(mockClient);
		vi.spyOn(mockClient, "stream").mockImplementation((req) => {
			capturedRequest = req;
			return original(req);
		});

		const agent = defineAgent({
			id: "test-agent",
			system: "You are a test agent.",
			model: "mock:mock-model",
			llmClient: mockClient,
		});

		await agent.invoke("hello");

		expect(capturedRequest).toMatchObject({
			model: { provider: "mock", modelId: "mock-model" },
		});
	});

	it("two agents with separate injected clients do not share state", async () => {
		const client1 = new MockLlmClient();
		const client2 = new MockLlmClient();
		const spy1 = vi.spyOn(client1, "stream");
		const spy2 = vi.spyOn(client2, "stream");

		const agent1 = defineAgent({
			id: "agent-1",
			system: "Agent 1",
			model: "mock:mock-model",
			llmClient: client1,
		});

		const agent2 = defineAgent({
			id: "agent-2",
			system: "Agent 2",
			model: "mock:mock-model",
			llmClient: client2,
		});

		await agent1.invoke("ping");
		await agent2.invoke("ping");

		expect(spy1).toHaveBeenCalledTimes(1);
		expect(spy2).toHaveBeenCalledTimes(1);
	});
});
