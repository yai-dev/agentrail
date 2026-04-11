/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { composeTransformContexts } from "@/host/context-pipeline.js";
import type { AgentrailProfile, AgentrailProfileContext } from "@/host/types.js";
import type { CapabilityBuildContext, CapabilityDescriptor } from "@agentrail/capabilities";
import type { Agent, ModelConfig, RuntimeTool, TransformContextFn } from "@agentrail/core";

/**
 * The value that a dynamic profile's `createAgent()` may return.
 *
 * Returning a plain `Agent` works as before. To avoid duplicating `modelConfig`
 * at the profile level, return the richer `{ agent, modelConfig }` object instead
 * — the framework will use that `modelConfig` automatically when wiring capabilities.
 */
export type DynamicAgentResult = Agent | { agent: Agent; modelConfig?: ModelConfig };

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
    /** Hard cap on agent loop turns before the runtime stops. */
    maxTurns?: number;
    /** Maximum number of output tokens requested from the provider. */
    maxTokens?: number;
    /** Sampling temperature forwarded to the provider when supported. */
    temperature?: number;
    /** Enables provider-specific reasoning or thinking modes when available. */
    thinkingEnabled?: boolean;
    /** Assistant-facing message appended when the max-turn limit is reached. */
    maxTurnsMessage?: string;
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
  /**
   * Per-request agent factory.
   *
   * Return a plain `Agent` for simple cases, or `{ agent, modelConfig }` when
   * capabilities that need model information (e.g. `skills()`) are declared.
   * Returning `modelConfig` here eliminates the need to repeat it at the profile level.
   *
   * ```ts
   * async createAgent(ctx) {
   *   const model = "anthropic:claude-sonnet-4-5";
   *   return {
   *     agent: defineAgent({ model, system: "..." }),
   *     modelConfig: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
   *   };
   * }
   * ```
   */
  createAgent(
    context: AgentrailProfileContext,
    onSubAgentEvent?: (event: object) => void,
  ): Promise<DynamicAgentResult>;
  /** Capability descriptors to compose into the agent. */
  capabilities?: CapabilityDescriptor[];
  /**
   * @deprecated Return `{ agent, modelConfig }` from `createAgent()` instead.
   * This field is consulted only as a fallback when `createAgent()` returns a plain `Agent`.
   */
  modelConfig?: ModelConfig;
}

/** The resolved profile descriptor returned by `defineProfile()`. */
export interface ProfileDefinition extends AgentrailProfile {
  /** Capability descriptors attached to this profile. */
  readonly capabilities?: CapabilityDescriptor[];
  /**
   * Resolved model configuration for this profile.
   * Present when the static shape provided `modelConfig` overrides.
   * Used by capabilities that spawn sub-agents (e.g. `skills()`).
   */
  readonly modelConfig?: Partial<ModelConfig>;
}

function isStaticShape(def: StaticProfileShape | DynamicProfileShape): def is StaticProfileShape {
  return "agent" in def;
}

function buildBaseCapCtx(
  context: AgentrailProfileContext,
  modelConfig?: ModelConfig,
  onSubAgentEvent?: (event: object) => void,
): CapabilityBuildContext {
  return {
    tenantId: context.tenantId,
    userId: context.userId,
    sessionId: context.sessionId,
    sessionRef: context.sessionRef,
    sessionStore: context.sessionStore,
    modelConfig,
    onSubAgentEvent,
  };
}

async function buildCapabilityTransformContext(
  capabilities: CapabilityDescriptor[] | undefined,
  capCtx: CapabilityBuildContext,
): Promise<TransformContextFn | undefined> {
  if (!capabilities?.length) return undefined;
  const transforms = await Promise.all(capabilities.map((c) => c.buildTransformContext?.(capCtx)));
  const activeTransforms = transforms.filter((t): t is TransformContextFn => Boolean(t));
  return activeTransforms.length > 0 ? composeTransformContexts(activeTransforms) : undefined;
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
 *   capabilities: [filesystem({ sandboxManager }), knowledge(km)],
 * });
 * ```
 *
 * **Dynamic** — provide `createAgent(context)` for request-scoped configuration:
 * ```ts
 * const myProfile = defineProfile({
 *   id: "assistant",
 *   name: "My Assistant",
 *   async createAgent(ctx) {
 *     return defineAgent({ model: "anthropic:claude-sonnet-4-5", system: "..." });
 *   },
 *   capabilities: [filesystem({ sandboxManager })],
 * });
 * ```
 *
 * @see {@link https://agentrail.run/concepts/profiles}
 */
export function defineProfile(def: StaticProfileShape | DynamicProfileShape): ProfileDefinition {
  if (isStaticShape(def)) {
    const {
      model,
      prompt,
      tools,
      maxTurns,
      maxTokens,
      temperature,
      thinkingEnabled,
      maxTurnsMessage,
    } = def.agent;

    // Normalise model string to a full ModelConfig once, at definition time.
    const colonIdx = model.indexOf(":");
    const baseModelCfg: ModelConfig =
      colonIdx > 0
        ? { provider: model.slice(0, colonIdx), modelId: model.slice(colonIdx + 1) }
        : { provider: model, modelId: model };
    const resolvedModelConfig: ModelConfig =
      def.modelConfig && Object.keys(def.modelConfig).length > 0
        ? { ...baseModelCfg, ...def.modelConfig }
        : baseModelCfg;

    return {
      id: def.id,
      name: def.name,
      capabilities: def.capabilities,
      modelConfig: def.modelConfig,

      async createAgent(
        context: AgentrailProfileContext,
        onSubAgentEvent?: (event: object) => void,
      ) {
        const { defineAgent } = await import("@agentrail/core");
        const system = typeof prompt === "function" ? await prompt(context) : prompt;

        let agent = defineAgent({
          id: def.id,
          model: resolvedModelConfig,
          system,
          tools: tools ?? [],
          maxTurns,
          maxTokens,
          temperature,
          thinkingEnabled,
          maxTurnsMessage,
        });

        if (def.capabilities?.length) {
          const capCtx = buildBaseCapCtx(context, resolvedModelConfig, onSubAgentEvent);
          const toolSets = await Promise.all(def.capabilities.map((c) => c.buildTools(capCtx)));
          const capTools = toolSets.flat();
          if (capTools.length) {
            agent = agent.withTools(capTools);
          }
        }

        return agent;
      },

      getContextProviders(context: AgentrailProfileContext) {
        if (!def.capabilities?.length) return [];
        const capCtx = buildBaseCapCtx(context, resolvedModelConfig);
        return def.capabilities.flatMap((c) => c.buildContextProviders?.(capCtx) ?? []);
      },

      async getTransformContext(context: AgentrailProfileContext) {
        const capCtx = buildBaseCapCtx(context, resolvedModelConfig);
        return (
          (await buildCapabilityTransformContext(def.capabilities, capCtx)) ??
          (async (messages) => messages)
        );
      },
    };
  }

  return {
    id: def.id,
    name: def.name,
    capabilities: def.capabilities,

    async createAgent(context: AgentrailProfileContext, onSubAgentEvent?: (event: object) => void) {
      const raw = await def.createAgent(context, onSubAgentEvent);
      const isWrapped = (r: DynamicAgentResult): r is { agent: Agent; modelConfig?: ModelConfig } =>
        typeof r === "object" && r !== null && "agent" in r;

      const baseAgent = isWrapped(raw) ? raw.agent : raw;
      // Prefer modelConfig from the return value; fall back to the deprecated top-level field.
      const resolvedModelConfig = (isWrapped(raw) ? raw.modelConfig : undefined) ?? def.modelConfig;

      if (!def.capabilities?.length) return baseAgent;

      const capCtx = buildBaseCapCtx(context, resolvedModelConfig, onSubAgentEvent);
      const toolSets = await Promise.all(def.capabilities.map((c) => c.buildTools(capCtx)));
      const capTools = toolSets.flat();
      return capTools.length ? baseAgent.withTools(capTools) : baseAgent;
    },

    getContextProviders(context: AgentrailProfileContext) {
      if (!def.capabilities?.length) return [];
      // getContextProviders has no access to the runtime return value — use the deprecated field.
      const capCtx = buildBaseCapCtx(context, def.modelConfig);
      return def.capabilities.flatMap((c) => c.buildContextProviders?.(capCtx) ?? []);
    },

    async getTransformContext(context: AgentrailProfileContext) {
      const capCtx = buildBaseCapCtx(context, def.modelConfig);
      return (
        (await buildCapabilityTransformContext(def.capabilities, capCtx)) ??
        (async (messages) => messages)
      );
    },
  };
}
