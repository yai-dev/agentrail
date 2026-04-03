/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AssistantMessage, ModelConfig, RuntimeTool } from "@agentrail/runtime-core";
import { defineAgent, extractText, isAgentEnd, tool, Type } from "@agentrail/runtime-core";
import type { SkillManager } from "./skill-manager.js";
import type { ExtendedSseEvent } from "./types.js";

/**
 * Build the single `Skill` tool.
 *
 * The tool description is generated dynamically at build time by reading the
 * current skill list, embedding it directly so the LLM sees available skills
 * without an extra round-trip tool call.
 *
 * Execution mode is controlled by `delegateToSubAgent`:
 * - true (default): spawns an isolated sub-agent to execute the skill.
 *   Sub-agent events are forwarded via `onEvent` using the bracket pattern:
 *   skill_start → [sub-agent events] → skill_end
 * - false (progressive disclosure): reads SKILL.md and returns its contents
 *   to the main agent, which then executes the steps directly using its own
 *   tools. Resources (scripts, data files) are loaded on-demand by the main
 *   agent as it works through the instructions (Level 3 loading).
 */
export async function buildSkillTool(
  skillManager: SkillManager,
  modelConfig: ModelConfig,
  executionTools: RuntimeTool[],
  onEvent?: (event: ExtendedSseEvent) => void,
  delegateToSubAgent = true,
  /**
   * When set, skill sub-agents use this container-internal path prefix instead
   * of the host-absolute skill directory. E.g. "/skills" → skill working dir
   * becomes "/skills/{skillName}" inside the sandbox container.
   */
  containerSkillsDir?: string,
  /**
   * When set, receives the full sub-agent message history (system prompt + all
   * turns) after each skill execution. Useful for debugging silent failures.
   */
  persistSubAgentLog?: (entry: SubAgentLogEntry) => Promise<void> | void,
  /**
   * When set, these identifiers are automatically prepended to every skill's
   * context so sub-agents always have tenant/user info even if the main agent
   * forgets to include them.
   */
  autoContext?: { tenantId: string; userId: string },
  /**
   * Maximum number of LLM turns the skill sub-agent is allowed to take.
   * Defaults to 8 — enough for a happy path (3-4 turns) plus a few retries,
   * while cutting off runaway trial-and-error loops (19-26 turns observed).
   * On the last turn all tools are disabled and the model must return its
   * best-effort result immediately.
   */
  subAgentMaxTurns = 8,
): Promise<RuntimeTool> {
  const skills = await skillManager.listSkills();

  const skillListText =
    skills.length > 0
      ? skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")
      : "(no skills available)";

  const modeDescription = delegateToSubAgent
    ? `Invoke a specialized skill to handle a complex task in an isolated sub-agent context.\n\n` +
      `The sub-agent executes the skill instructions autonomously and returns its final output.`
    : `Invoke a specialized skill to retrieve its execution instructions.\n\n` +
      `The tool returns the skill's SKILL.md instructions along with its working directory path. ` +
      `You then execute the steps yourself using your own tools (bash, read, etc.).`;

  const description =
    `${modeDescription}\n\n` +
    `Available skills:\n${skillListText}\n\n` +
    `Parameters:\n` +
    `- skillName: one of the skill names listed above\n` +
    `- task: clear description of what needs to be accomplished\n` +
    `- context: relevant information from the current conversation (customer data, filters, etc.)`;

  return tool()
    .name("Skill")
    .label("Skill")
    .description(description)
    .parameters(
      Type.Object({
        skillName: Type.String({
          description:
            "Name of the skill to invoke. Must be one of the available skills listed above.",
        }),
        task: Type.String({
          description: "Clear description of the task for the skill to accomplish.",
        }),
        context: Type.Optional(
          Type.String({
            description:
              "Relevant context from the current conversation (e.g. customer names, filters, field values).",
          }),
        ),
      }),
    )
    .execute(async ({ skillName, task, context }) => {
      let skillContent: string;
      try {
        skillContent = await skillManager.readSkill(skillName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { error: message },
        };
      }

      const hostSkillDir = skillManager.getSkillDir(skillName);
      // Use container-internal path when running inside a sandbox, otherwise
      // fall back to the host-absolute path.
      const skillDir = containerSkillsDir ? `${containerSkillsDir}/${skillName}` : hostSkillDir;

      // ── Direct execution mode (progressive disclosure) ──────────────
      // Return SKILL.md instructions to the main agent so it can execute
      // the steps itself (Level 2 load). Scripts and resources are loaded
      // on-demand by the main agent as it works through each step (Level 3).
      if (!delegateToSubAgent) {
        const autoCtxPrefixDirect = autoContext
          ? `tenant_id: ${autoContext.tenantId}, user_id: ${autoContext.userId}`
          : null;
        const mergedContextDirect = [autoCtxPrefixDirect, context].filter(Boolean).join(", ");
        const responseText =
          `[Direct Execution Mode]\n` +
          `Skill: ${skillName}\n` +
          `Working Directory: ${skillDir}\n` +
          `All scripts are in: ${skillDir}/scripts/\n` +
          (mergedContextDirect
            ? `\nTask: ${task}\n\nContext:\n${mergedContextDirect}`
            : `\nTask: ${task}`) +
          `\n\n--- Instructions ---\n\n` +
          skillContent;

        return {
          content: [{ type: "text" as const, text: responseText }],
          details: { skillName, task, mode: "direct" },
        };
      }

      // ── Sub-agent delegation mode (default) ─────────────────────────
      const systemPrompt =
        `You are executing the "${skillName}" skill.\n` +
        `Skill root directory: ${skillDir}\n` +
        `Scripts directory: ${skillDir}/scripts/\n\n` +
        `PATH RESOLUTION RULES (MANDATORY):\n` +
        `- Bash commands: ALL relative paths in the instructions (e.g. \`scripts/run_pipeline.sh\`, \`scripts/requirements.txt\`) ` +
        `refer to paths relative to the skill root. Prepend the skill root, e.g.:\n` +
        `    bash ${skillDir}/scripts/run_pipeline.sh ...\n` +
        `    python3 -c "..." || pip3 install -q -r ${skillDir}/scripts/requirements.txt\n` +
        `- Read tool: ALL relative paths must be converted to absolute paths by prepending the skill root, e.g.:\n` +
        `    scripts/request.json.template  →  ${skillDir}/scripts/request.json.template\n\n` +
        `Follow the instructions below precisely.\n\n` +
        skillContent;

      // Always prepend tenant/user identifiers so sub-agents can authenticate
      // API calls even when the main agent omits them from the context.
      const autoCtxPrefix = autoContext
        ? `tenant_id: ${autoContext.tenantId}, user_id: ${autoContext.userId}`
        : null;
      const mergedContext = [autoCtxPrefix, context].filter(Boolean).join(", ");
      const input = mergedContext ? `Task: ${task}\n\nContext:\n${mergedContext}` : `Task: ${task}`;

      const subAgent = defineAgent({
        id: `skill-executor-${skillName}`,
        name: `Skill Executor: ${skillName}`,
        model: modelConfig,
        system: systemPrompt,
        tools: executionTools,
        maxTokens: 8192,
        maxTurns: subAgentMaxTurns,
        maxTurnsMessage:
          "You have reached the turn budget for this skill. " +
          "Return your best-effort result now based on what you have already gathered. " +
          "Report any queries that failed or returned no useful data. " +
          "Do not make any tool calls.",
      });

      // Emit bracket start
      onEvent?.({ type: "skill_start", skillName, task });

      // Only these event types are relevant to the parent workspace panel.
      // message_update / message_start / message_end carry the sub-agent's
      // intermediate text output and must NOT be forwarded — forwarding them
      // would cause the skill's step-by-step reasoning to appear in the main
      // assistant bubble.
      const WORKSPACE_EVENTS = new Set([
        "tool_execution_start",
        "tool_execution_end",
        "turn_start",
        "turn_end",
      ]);

      let resultText = "";
      const startedAt = Date.now();
      try {
        const subStream = subAgent.stream(input);

        for await (const event of subStream) {
          if (WORKSPACE_EVENTS.has(event.type)) {
            onEvent?.(event);
          }
          if (isAgentEnd(event)) {
            const lastMsg = event.messages[event.messages.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
              const am = lastMsg as AssistantMessage;
              resultText = extractText(am);

              // Fallback A: LLM API error — content is [], expose errorMessage
              if (!resultText && am.stopReason === "error") {
                resultText = `[Skill sub-agent error: ${am.errorMessage ?? "unknown LLM error"}]`;
              }

              // Fallback B: thinking-only response — extract thinking content
              if (!resultText) {
                resultText = am.content
                  .filter((b): b is { type: "thinking"; thinking: string } => b.type === "thinking")
                  .map((b) => b.thinking)
                  .join("");
              }
            }
            // Persist sub-agent message history for debugging
            if (persistSubAgentLog) {
              const finishedAt = Date.now();
              void persistSubAgentLog({
                skillName,
                task,
                input,
                systemPrompt,
                messages: event.messages,
                resultText,
                startedAt,
                finishedAt,
              });
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onEvent?.({ type: "skill_end", skillName });
        return {
          content: [{ type: "text" as const, text: `Skill execution failed: ${message}` }],
          details: { error: message },
        };
      }

      // Emit bracket end
      onEvent?.({ type: "skill_end", skillName });

      return {
        content: [{ type: "text" as const, text: resultText || "(skill returned no output)" }],
        details: { skillName, task, mode: "sub-agent" },
      };
    })
    .build();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-agent log persistence
// ─────────────────────────────────────────────────────────────────────────────

interface SubAgentLogEntry {
  skillName: string;
  task: string;
  input: string;
  systemPrompt: string;
  messages: unknown[];
  resultText: string;
  startedAt: number;
  finishedAt: number;
}
