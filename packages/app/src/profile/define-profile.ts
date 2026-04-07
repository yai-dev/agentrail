/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { Agent, ModelConfig, RuntimeTool } from "@agentrail/core";
import type { CapabilityDescriptor } from "@agentrail/capabilities";
import type { AgentrailProfile, AgentrailProfileContext } from "../host/types.js";

/**
 * Static profile shape: the agent is fully described upfront.
 * Internally compiled to a `createAgent` function.
 */
export interface StaticProfileShape {
  /** Unique stable identifier for this profile. */
  id: string;
  /** Human-readable profile name. */
  name: string;
  /** Agent configuration. */
  agent: {
    model: string;
    prompt: string | ((context: AgentrailProfileContext) => string | Promise<string>);
    tools?: RuntimeTool[];
  };
  /** Optional model configuration overrides. */
  modelConfig?: Partial<ModelConfig>;
  /** Capability descriptors to compose into the agent. */
  capabilities?: CapabilityDescriptor[];
}

/**
 * Dynamic profile shape: the agent is constructed per-request.
 */
export interface DynamicProfileShape {
  /** Unique stable identifier for this profile. */
  id: string;
  /** Human-readable profile name. */
  name: string;
  /** Per-request agent factory. Receives full profile context. */
  createAgent(context: AgentrailProfileContext): Promise<Agent>;
  /** Capability descriptors to compose into the agent. */
  capabilities?: CapabilityDescriptor[];
}

/** The resolved profile descriptor returned by `defineProfile()`. */
export interface ProfileDefinition extends AgentrailProfile {
  /** Capability descriptors attached to this profile. */
  readonly capabilities?: CapabilityDescriptor[];
}

function isStaticShape(def: StaticProfileShape | DynamicProfileShape): def is StaticProfileShape {
  return "agent" in def;
}

/**
 * Defines an agent profile in either static or dynamic form.
 *
 * **Static** — provide `agent: { model, prompt }` for simple, declarative profiles:
 * ```ts
 * const myProfile = defineProfile({
 *   id: "assistant",
 *   name: "My Assistant",
 *   agent: { model: "claude-3-5-sonnet-20241022", prompt: "You are a helpful assistant." },
 *   capabilities: [filesystem(), knowledge(km)],
 * });
 * ```
 *
 * **Dynamic** — provide `createAgent(context)` for request-scoped configuration:
 * ```ts
 * const myProfile = defineProfile({
 *   id: "assistant",
 *   name: "My Assistant",
 *   async createAgent(ctx) {
 *     return defineAgent({ model: "claude-3-5-sonnet-20241022", systemPrompt: "..." });
 *   },
 *   capabilities: [filesystem()],
 * });
 * ```
 *
 * @see {@link https://agentrail.run/concepts/profiles}
 */
export function defineProfile(def: StaticProfileShape | DynamicProfileShape): ProfileDefinition {
  if (isStaticShape(def)) {
    return {
      id: def.id,
      name: def.name,
      capabilities: def.capabilities,
      async createAgent(context: AgentrailProfileContext) {
        const { defineAgent } = await import("@agentrail/core");
        const { model, prompt, tools } = def.agent;
        const system =
          typeof prompt === "function" ? await prompt(context) : prompt;
        return defineAgent({
          id: def.id,
          model,
          system,
          tools: tools ?? [],
        });
      },
    };
  }

  return {
    id: def.id,
    name: def.name,
    capabilities: def.capabilities,
    createAgent: def.createAgent.bind(def),
  };
}
