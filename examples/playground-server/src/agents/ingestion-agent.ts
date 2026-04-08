/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type {
  IngestionEvent,
  IngestionStep,
  KnowledgeManager,
  Taxonomy,
} from "@agentrail/capabilities";
import { createKbReadTool } from "@agentrail/capabilities";
import type { ModelConfig } from "@agentrail/core";
import { defineAgent, isRuntimeError } from "@agentrail/core";
import { writeTool } from "@agentrail/capabilities";
import fs from "node:fs/promises";
import path from "node:path";

// ---- types ------------------------------------------------------------------

export interface IngestionResult {
  category: string[];
  topics: string[];
  summary: string | null;
}

export interface RunIngestionAgentOptions {
  knowledgeManager: KnowledgeManager;
  tenantId: string;
  kbDir: string;
  docId: string;
  title: string;
  taxonomy: Taxonomy;
  modelConfig: ModelConfig;
  onEvent: (event: IngestionEvent) => void | Promise<void>;
}

// ---- step detection helpers -------------------------------------------------

function detectStep(toolName: string, filePath: string, kbDir: string): IngestionStep | null {
  // KbRead uses relative paths; Write uses absolute paths
  const rel = path.isAbsolute(filePath) ? path.relative(kbDir, filePath) : filePath;
  if (toolName === "KbRead" && rel.startsWith("pending")) return "analyze";
  if (toolName === "Write" && rel === "taxonomy.json") return "classify";
  if (toolName === "Write" && rel.startsWith("pending")) return "summarize";
  if (toolName === "Write" && rel.startsWith("indexes")) return "index_update";
  return null;
}

// ---- system prompt ----------------------------------------------------------

function buildIngestionPrompt(
  kbDir: string,
  docId: string,
  title: string,
  taxonomy: Taxonomy,
): string {
  const pendingPath = path.join(kbDir, "pending", `${docId}.md`);
  const taxonomyPath = path.join(kbDir, "taxonomy.json");
  const indexesDir = path.join(kbDir, "indexes");

  return `You are a Knowledge Base Ingestion Agent. Your job is to process a document and integrate it into the knowledge base.

Working directory: ${kbDir}
Document ID: ${docId}
Document title: ${title}
Pending document path: ${pendingPath}

Current taxonomy:
${JSON.stringify(taxonomy, null, 2)}

You must complete the following steps in order:

## Step 1: analyze
Use the KbRead tool to read the document at "pending/${docId}.md" and understand its content, structure, and key concepts.

## Step 2: classify
Based on your analysis, determine ONE category path and 2-5 topic keywords for this document.
Rules:
- Use the SAME language throughout: if existing taxonomy uses English, use English; if Chinese, use Chinese. If taxonomy is empty, match the document's language.
- Category path: 2-4 levels deep, e.g. ["AI", "RAG", "architecture"] or ["产品", "价格"]
- Do NOT add redundant nodes in other languages
- Update ${taxonomyPath}: keep all existing nodes, only ADD the new category path nodes if missing.
- Write valid JSON to ${taxonomyPath}.

## Step 3: summarize
Write a one-sentence summary of the document. Do NOT modify the document file itself.
Just remember this summary for step 5.

## Step 4: index_update
For each topic you identified, read or create a topic index file at ${indexesDir}/{topic}_index.md.
Append a reference line for this document using the FINAL docs path (not pending):
- [${title}](../docs/<category_path>/${docId}.md) — <brief description>

Where <category_path> is the category you chose in step 2, joined by "/" (e.g. AI/RAG/architecture).

## Step 5: complete
Write a JSON file at ${path.join(kbDir, "pending", `${docId}_meta.json`)} with:
{
  "category": ["<cat0>", "<cat1>"],
  "topics": ["<topic1>", "<topic2>"],
  "summary": "<the one-sentence summary from step 3>"
}

This JSON will be read by the server to finalize the document. Work through each step carefully and completely.`;
}

// ---- main export ------------------------------------------------------------

export async function runIngestionAgent(
  options: RunIngestionAgentOptions,
): Promise<IngestionResult> {
  const { knowledgeManager, tenantId, kbDir, docId, title, taxonomy, modelConfig, onEvent } =
    options;

  const agent = defineAgent({
    id: "ingestion-agent",
    name: "Knowledge Base Ingestion Agent",
    model: modelConfig,
    system: buildIngestionPrompt(kbDir, docId, title, taxonomy),
    tools: [createKbReadTool(knowledgeManager, tenantId), writeTool],
    maxTokens: 4096,
  });

  const completedSteps = new Set<IngestionStep>();
  const STEP_ORDER: IngestionStep[] = ["analyze", "classify", "summarize", "index_update"];
  // Track args by toolCallId from tool_execution_start
  const pendingToolArgs = new Map<string, Record<string, unknown>>();

  await onEvent({ type: "step_start", step: "analyze", message: "Reading document content" });

  try {
    const agentStream = agent.stream("Process the document following all steps in order.", {});

    for await (const event of agentStream) {
      if (isRuntimeError(event)) {
        const msg = (event.error as Error)?.message ?? "Unknown error";
        throw new Error(msg);
      }

      if (event.type === "tool_execution_start") {
        const { toolCallId, args } = event as {
          type: string;
          toolCallId: string;
          toolName: string;
          args: unknown;
        };
        if (args && typeof args === "object") {
          pendingToolArgs.set(toolCallId, args as Record<string, unknown>);
        }
      }

      if (event.type === "tool_execution_end") {
        const { toolCallId, toolName } = event as {
          type: string;
          toolCallId: string;
          toolName: string;
          result: unknown;
          isError: boolean;
        };
        const args = pendingToolArgs.get(toolCallId) ?? {};
        pendingToolArgs.delete(toolCallId);
        // KbRead uses "path" (relative), Write uses "file_path" (absolute)
        const filePath =
          (args as { path?: string }).path ?? (args as { file_path?: string }).file_path ?? "";
        const step = detectStep(toolName, filePath, kbDir);

        if (step && !completedSteps.has(step)) {
          // complete previous step if any
          const stepIdx = STEP_ORDER.indexOf(step);
          if (stepIdx > 0) {
            const prevStep = STEP_ORDER[stepIdx - 1];
            if (!completedSteps.has(prevStep)) {
              await onEvent({ type: "step_complete", step: prevStep });
              completedSteps.add(prevStep);
              // start this step
              const stepMessages: Record<IngestionStep, string> = {
                analyze: "Reading document content",
                classify: "Classifying into taxonomy",
                summarize: "Generating summary",
                index_update: "Updating topic indexes",
                register: "Registering document",
              };
              await onEvent({ type: "step_start", step, message: stepMessages[step] });
            }
          }
        }
      }

      if (event.type === "agent_end") break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await onEvent({ type: "step_error", step: "analyze", error: msg });
    throw err;
  }

  // Complete any steps not yet emitted
  for (const step of STEP_ORDER) {
    if (!completedSteps.has(step)) {
      await onEvent({ type: "step_complete", step });
      completedSteps.add(step);
    }
  }

  await onEvent({ type: "step_start", step: "register", message: "Registering document" });

  // Read meta JSON written by the agent
  const metaPath = path.join(kbDir, "pending", `${docId}_meta.json`);
  let result: IngestionResult = { category: [], topics: [], summary: null };
  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      category?: string[];
      topics?: string[];
      summary?: string;
    };
    result = {
      category: Array.isArray(parsed.category) ? parsed.category : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
    };
    await fs.rm(metaPath, { force: true });
  } catch {
    // agent may not have written meta; use defaults
  }

  return result;
}
