/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { SessionRef } from "@agentrail/memo";
import {
  OrchestrationManager,
  createFilesystemOrchestrationPersistence,
} from "@agentrail/orchestration";
import { defineAgent, type Message, type RuntimeEvent } from "@agentrail/runtime-core";
import { SandboxManager } from "@agentrail/sandbox";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createManagedDeepResearchAgent,
  createRun,
  mapDeepResearchOrchestrationEvent,
  summarizeHistory,
  zeroUsage,
} from "./coordinator-internals.js";
import { getPlannerPrompt, getReporterPrompt } from "./prompts.js";
import type { DeepResearchRuntimeConfig } from "./runtime.js";
import type { DeepResearchStore } from "./store.js";
import { createFileSystemDeepResearchStore } from "./store.js";
import type {
  AnalystOutput,
  CoderOutput,
  DeepResearchArtifact,
  DeepResearchEntityProfile,
  DeepResearchEvent,
  DeepResearchPlan,
  DeepResearchSource,
  DeepResearchState,
  DeepResearchStep,
  PlannerOutput,
  ResearcherOutput,
} from "./types.js";
import {
  buildFetchDomainBudget,
  buildStepDigest,
  classifySource,
  deriveEntityProfile,
  extractJsonObject,
  extractResearcherSummaryFallback,
  formatStepDigest,
  guessArtifactKind,
  guessMimeType,
  normalizeEvidenceTable,
  normalizePlan,
  normalizeResearchProfile,
  normalizeResearchUrl,
  nowIso,
  sanitizeReportMarkdown,
  sanitizeResearchSummary,
  scoreSourceConfidence,
  scoreSourceTier,
  selectBlockedFetchDomains,
  selectSourcesForReport,
  selectSourcesForResearchContext,
  slugifyTitle,
} from "./utils.js";

export interface DeepResearchCoordinatorOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  query: string;
  history: Message[];
  runtime: DeepResearchRuntimeConfig;
}

type EmitFn = (event: Record<string, unknown>) => Promise<void> | void;

/**
 * Coordinates the full Deep Research lifecycle for one run.
 *
 * The planner decides the initial intent/profile, the coordinator preserves
 * that decision in state, and each later step is executed through a managed
 * sub-agent with curated context.
 */
export class DeepResearchCoordinator {
  private readonly store: DeepResearchStore;
  private readonly sandboxManager: SandboxManager;
  private readonly runId: string;
  private readonly state: DeepResearchState;
  private readonly sourcesByUrl = new Map<string, DeepResearchSource>();
  private manager?: OrchestrationManager;

  constructor(private readonly options: DeepResearchCoordinatorOptions) {
    this.runId = `deep-research:${options.sessionId}:${randomUUID()}`;
    const run = createRun(options, this.runId);
    this.state = {
      run,
      plan: null,
      steps: [],
      sources: [],
      artifacts: [],
      reportMarkdown: "",
      entityProfile: null,
    };
    this.store = createFileSystemDeepResearchStore(options.runtime.dataDir, options.sessionRef);
    this.sandboxManager = new SandboxManager(options.runtime.dataDir, options.runtime.sandbox);
  }

  async runStreaming(emit: EmitFn): Promise<DeepResearchState> {
    await this.store.initializeRun(this.state);
    await emit({ type: "agent_start" });
    await this.emitDeepResearchEvent(
      { type: "deep_research_start", run: this.state.run, timestamp: nowIso() },
      emit,
    );

    try {
      this.manager = await this.createManager(emit);
      await this.manager.startRun({
        runId: this.runId,
        initialTask: {
          id: `task:${this.runId}:root`,
          kind: "deep-research",
          input: {
            query: this.options.query,
          },
        },
      });

      const plan = await this.buildPlan();
      this.state.plan = plan;
      this.state.entityProfile = plan.researchProfile ?? null;
      this.state.run.title = plan.title;
      this.state.run.updatedAt = nowIso();
      this.state.steps = plan.steps.map((step, index) => ({
        id: `step:${this.runId}:${index}`,
        index,
        type: step.type,
        title: step.title,
        description: step.description,
        status: "pending",
      }));
      await this.store.writeState(this.state);
      await this.emitDeepResearchEvent(
        {
          type: "deep_research_plan",
          runId: this.runId,
          plan,
          researchProfile: this.state.entityProfile,
          steps: this.state.steps,
          timestamp: nowIso(),
        },
        emit,
      );

      for (const step of this.state.steps) {
        await this.runStep(step, emit);
      }

      this.state.reportMarkdown = await this.generateReport(emit);
      await this.manager.completeRun({ runId: this.runId, status: "completed" });
      this.state.run.status = "completed";
      this.state.run.updatedAt = nowIso();
      this.state.run.completedAt = this.state.run.updatedAt;
      await this.store.writeState(this.state);
      await this.emitDeepResearchEvent(
        {
          type: "deep_research_complete",
          runId: this.runId,
          status: "completed",
          reportMarkdown: this.state.reportMarkdown,
          timestamp: nowIso(),
        },
        emit,
      );
      await emit({
        type: "agent_end",
        messages: [],
        usage: zeroUsage(),
      });
      return this.state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.manager) {
        await this.manager
          .completeRun({
            runId: this.runId,
            status: "failed",
            error: message,
          })
          .catch(() => undefined);
      }
      this.state.run.status = "failed";
      this.state.run.error = message;
      this.state.run.completedAt = nowIso();
      this.state.run.updatedAt = nowIso();
      await this.store.writeState(this.state);
      await this.emitDeepResearchEvent(
        {
          type: "deep_research_complete",
          runId: this.runId,
          status: "failed",
          reportMarkdown: this.state.reportMarkdown,
          error: message,
          timestamp: nowIso(),
        },
        emit,
      );
      throw error;
    }
  }

  async runBlocking(): Promise<DeepResearchState> {
    return this.runStreaming(() => {});
  }

  private async createManager(emit: EmitFn): Promise<OrchestrationManager> {
    const manager = await OrchestrationManager.create({
      persistence: createFilesystemOrchestrationPersistence(
        this.options.runtime.dataDir,
        this.options.sessionRef,
      ),
      runtime: {
        createAgent: async (input) => createManagedDeepResearchAgent(this.options, input),
      },
    });
    manager.subscribe(({ event }) => {
      const mapped = mapDeepResearchOrchestrationEvent(event);
      if (mapped) {
        void emit(mapped);
      }
    });
    return manager;
  }

  private async emitDeepResearchEvent(event: DeepResearchEvent, emit: EmitFn): Promise<void> {
    await this.store.appendEvent(this.runId, event);
    await emit(event);
  }

  private async buildPlan(): Promise<DeepResearchPlan> {
    // Planner is intentionally the first place where we ask the model to
    // identify the user's intent. That gives the rest of the workflow a stable
    // starting profile instead of guessing later from already-noisy summaries.
    const planner = defineAgent({
      id: "deep-research-planner",
      name: "Deep Research Planner",
      model: this.options.runtime.model,
      system: getPlannerPrompt(new Date().toISOString().slice(0, 10)),
      maxTokens: 2400,
      temperature: 0.2,
    });

    const historyText = summarizeHistory(this.options.history);
    const input = [
      `Research request:\n${this.options.query}`,
      historyText ? `Recent conversation context:\n${historyText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await planner.invoke(input);
    const planOutput = extractJsonObject<PlannerOutput>(result.text);
    return normalizePlan(this.options.query, planOutput);
  }

  private async runStep(step: DeepResearchStep, emit: EmitFn): Promise<void> {
    step.status = "running";
    step.startedAt = nowIso();
    step.error = undefined;
    await this.store.writeState(this.state);
    await this.emitDeepResearchEvent(
      {
        type: "deep_research_step",
        runId: this.runId,
        step: { ...step },
        entityProfile: this.state.entityProfile,
        timestamp: nowIso(),
      },
      emit,
    );

    try {
      const prompt = this.buildStepPrompt(step);
      const role =
        step.type === "processing" ? "coder" : step.type === "analysis" ? "analyst" : "researcher";
      const outputText = await this.executeManagedStep(role, step.id, prompt);
      step.output = outputText;

      if (step.type === "research") {
        const parsed = extractJsonObject<ResearcherOutput>(outputText);
        step.summary = parsed?.summary
          ? sanitizeResearchSummary(parsed.summary)
          : (extractResearcherSummaryFallback(outputText) ?? sanitizeResearchSummary(outputText));
        step.profileUpdateReason = this.mergeEntityProfile(parsed?.entityProfile, step.summary);
        await this.refreshSourceClassifications(emit);
        await this.mergeSources(step.id, parsed?.sources ?? [], emit, {
          entityProfile: this.state.entityProfile,
        });
        await this.mergeSources(step.id, parsed?.excludedSources ?? [], emit, {
          entityProfile: this.state.entityProfile,
          explicitExcludedUrls: new Set(
            (parsed?.excludedSources ?? [])
              .flatMap((source) =>
                source?.url ? [normalizeResearchUrl(source.normalizedUrl ?? source.url)] : [],
              )
              .filter(Boolean),
          ),
          note: "Excluded from usable evidence due to entity mismatch or weak relevance",
        });
      } else if (step.type === "analysis") {
        const parsed = extractJsonObject<AnalystOutput>(outputText);
        step.summary = parsed?.summary ?? outputText;
        step.evidenceTable = normalizeEvidenceTable(
          parsed?.evidenceTable,
          this.state.sources.filter((source) => (source.status ?? "accepted") === "accepted"),
        );
      } else {
        const parsed = extractJsonObject<CoderOutput>(outputText);
        step.summary = parsed?.summary ?? outputText;
        await this.mergeArtifacts(step.id, parsed?.artifacts ?? [], emit);
      }

      step.digest = buildStepDigest(
        step,
        this.state.sources.filter(
          (source) =>
            (source.status ?? "accepted") === "accepted" && source.usedByStepIds.includes(step.id),
        ),
      );
      step.status = "completed";
      step.completedAt = nowIso();
    } catch (error) {
      step.status = "failed";
      step.completedAt = nowIso();
      step.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.state.run.updatedAt = nowIso();
      await this.store.writeState(this.state);
      await this.emitDeepResearchEvent(
        {
          type: "deep_research_step",
          runId: this.runId,
          step: { ...step },
          entityProfile: this.state.entityProfile,
          profileUpdateReason: step.profileUpdateReason,
          timestamp: nowIso(),
        },
        emit,
      );
    }
  }

  private buildStepPrompt(step: DeepResearchStep): string {
    // Only a compressed slice of prior work is carried into the next step.
    // This keeps prompts small and prevents one malformed summary from
    // polluting the rest of the run.
    const completedSteps = this.state.steps.filter(
      (item) => item.index < step.index && item.summary,
    );
    const recentDigests = completedSteps
      .slice(-2)
      .flatMap((item) => (item.digest ? [formatStepDigest(item.digest)] : []))
      .join("\n\n");
    const acceptedSources = this.state.sources.filter(
      (source) => (source.status ?? "accepted") === "accepted",
    );
    const contextualSources =
      step.type === "research"
        ? selectSourcesForResearchContext(
            acceptedSources,
            `${this.options.query}\n${step.title}\n${step.description}`,
          )
        : acceptedSources;
    const sources = contextualSources
      .map((source) => {
        const sourceMeta = [
          `URL: ${source.normalizedUrl ?? source.url}`,
          source.tier ? `Tier: ${source.tier}` : "",
          `Confidence: ${source.confidence ?? "medium_confidence"}`,
          source.evidenceLevel ? `Evidence: ${source.evidenceLevel}` : "",
          source.fetchStatus ? `Fetch: ${source.fetchStatus}` : "",
          source.snippet ? `Notes: ${source.snippet}` : "",
        ]
          .filter(Boolean)
          .join("\n  ");
        return `- [${source.id}] ${source.title} (${source.domain})\n  ${sourceMeta}`;
      })
      .join("\n");
    const excludedSources = this.state.sources
      .filter((source) => source.status === "related_but_excluded")
      .slice(0, 6)
      .map((source) => `- ${source.title} (${source.url})${source.note ? ` — ${source.note}` : ""}`)
      .join("\n");
    const fetchDomainBudget = buildFetchDomainBudget(this.state.sources);
    const blockedDomains = selectBlockedFetchDomains(this.state.sources);
    const fetchBudgetText = Object.entries(fetchDomainBudget)
      .map(([domain, stats]) => {
        const entries = Object.entries(stats)
          .filter(([, count]) => count > 0)
          .map(([status, count]) => `${status}:${count}`)
          .join(", ");
        return entries ? `- ${domain}: ${entries}` : "";
      })
      .filter(Boolean)
      .slice(0, 8)
      .join("\n");
    const artifacts = this.state.artifacts
      .map((artifact) => `- ${artifact.title}: ${artifact.path}`)
      .join("\n");
    const entityProfile = this.state.entityProfile
      ? [
          `Context profile:`,
          `- Mode: ${this.state.entityProfile.mode}`,
          `- Profile source: ${this.state.entityProfile.source}`,
          `- Profile confidence: ${this.state.entityProfile.confidence}`,
          this.state.entityProfile.officialName
            ? `- Official name: ${this.state.entityProfile.officialName}`
            : "",
          this.state.entityProfile.aliases.length > 0
            ? `- Aliases: ${this.state.entityProfile.aliases.join(", ")}`
            : "",
          this.state.entityProfile.scopeTerms.length > 0
            ? `- Scope terms: ${this.state.entityProfile.scopeTerms.join(", ")}`
            : "",
          this.state.entityProfile.disambiguationNotes.length > 0
            ? `- Disambiguation notes: ${this.state.entityProfile.disambiguationNotes.join(" | ")}`
            : "",
          this.state.entityProfile.excludedEntities.length > 0
            ? `- Excluded related entities: ${this.state.entityProfile.excludedEntities.join(", ")}`
            : "",
          this.state.entityProfile.relatedEntities.length > 0
            ? `- Related entities to compare or track: ${this.state.entityProfile.relatedEntities.join(
                ", ",
              )}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    if (step.type === "research") {
      return [
        `Research query:\n${this.options.query}`,
        entityProfile,
        `Current step:\n[${step.type}] ${step.title}\n${step.description}`,
        recentDigests ? `Recent step digests:\n${recentDigests}` : "",
        sources ? `Accepted known sources:\n${sources}` : "",
        excludedSources ? `Known excluded/related-but-not-target sources:\n${excludedSources}` : "",
        fetchBudgetText ? `Fetch results so far by domain:\n${fetchBudgetText}` : "",
        blockedDomains.length > 0
          ? `Avoid FetchUrl for these blocked domains in this run unless absolutely necessary: ${blockedDomains.join(
              ", ",
            )}`
          : "",
        artifacts ? `Known artifacts:\n${artifacts}` : "",
        "Research requirements:",
        this.state.entityProfile?.mode === "entity_disambiguation"
          ? "- Re-run targeted search using the canonical entity name where available."
          : "- Use scope terms and related entities to broaden query coverage without treating competitors as excluded entities.",
        "- Do not rely on search snippets alone for important claims.",
        "- Validate key claims with FetchUrl or an official page body before stating them.",
        "- Track each returned source with fetchStatus and evidenceLevel based on what you actually verified.",
        "- Prefer official sites, registries, reputable hiring/company pages, and certification/public notice pages.",
        "- If you find same-name but different entities, put them in excludedSources instead of sources.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    const acceptedForAnalysis = acceptedSources
      .filter((source) => source.confidence !== "low_confidence")
      .map(
        (source) =>
          `- [${source.id}] ${source.title} (${source.domain}) — ${
            source.confidence ?? "medium_confidence"
          } / ${source.evidenceLevel ?? "unverified"}`,
      )
      .join("\n");
    const evidenceTableText = completedSteps
      .flatMap((item) => item.evidenceTable ?? [])
      .map((row) => `- ${row.claim} [${row.confidence}] (${row.supportingSourceIds.join(", ")})`)
      .join("\n");

    return [
      `Research query:\n${this.options.query}`,
      entityProfile,
      `Current step:\n[${step.type}] ${step.title}\n${step.description}`,
      completedSteps.length > 0
        ? `Completed step summaries:\n${completedSteps
            .map((item) => `Step ${item.index + 1} (${item.type}) - ${item.title}\n${item.summary}`)
            .join("\n\n")}`
        : "",
      recentDigests ? `Recent step digests:\n${recentDigests}` : "",
      evidenceTableText ? `Normalized evidence table so far:\n${evidenceTableText}` : "",
      acceptedForAnalysis ? `Accepted sources for synthesis:\n${acceptedForAnalysis}` : "",
      artifacts ? `Known artifacts:\n${artifacts}` : "",
      step.type === "processing"
        ? `Save any generated files under /workspace/.deep-research/artifacts/${slugifyTitle(
            step.title,
          )}-...`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private async executeManagedStep(
    role: "researcher" | "analyst" | "coder",
    stepId: string,
    prompt: string,
  ): Promise<string> {
    if (!this.manager) {
      throw new Error("Deep research orchestration manager is not ready");
    }

    const agentId = `${role}:${this.runId}:${stepId}`;
    let closeReason = "step completed";

    try {
      await this.manager.spawnAgent({
        id: agentId,
        runId: this.runId,
        role,
      });
      await this.manager.sendInput({
        id: `input:${agentId}`,
        agentId,
        payload: { prompt },
      });
      await this.manager.waitForAgents({
        id: `wait:${agentId}`,
        agentId,
        kind: "agent-idle",
        description: `Wait for ${role} to complete`,
      });
      const snapshot = this.manager.getSnapshot();
      const lastJob = snapshot.agents[agentId]?.lastJob;

      if (!lastJob) {
        throw new Error(`${role} agent ${agentId} became idle without reporting a job result.`);
      }

      if (lastJob.outcome !== "completed") {
        throw new Error(
          lastJob.error ?? `${role} agent ${agentId} finished with outcome ${lastJob.outcome}.`,
        );
      }

      return lastJob.outputText ?? "";
    } catch (error) {
      closeReason = `step failed: ${error instanceof Error ? error.message : String(error)}`;
      throw error;
    } finally {
      await this.closeManagedAgent(agentId, closeReason);
    }
  }

  private async closeManagedAgent(agentId: string, reason: string): Promise<void> {
    if (!this.manager) {
      return;
    }

    const agent = this.manager.getSnapshot().agents[agentId];
    if (!agent || agent.status === "closed" || agent.status === "closing") {
      return;
    }

    await this.manager
      .closeAgent({
        id: `close:${agentId}:${randomUUID()}`,
        agentId,
        reason,
      })
      .catch(() => undefined);
  }

  private async mergeSources(
    stepId: string,
    sources: ResearcherOutput["sources"] | ResearcherOutput["excludedSources"],
    emit: EmitFn,
    options?: {
      entityProfile?: DeepResearchEntityProfile | null;
      explicitExcludedUrls?: Set<string>;
      note?: string;
    },
  ): Promise<void> {
    // Source normalization is where we attach the "quality metadata" that later
    // prompt builders and the reporter rely on: status, confidence, tier,
    // evidence level, fetch status, and exclusion reasons.
    for (const source of sources ?? []) {
      if (!source?.url) continue;
      const normalizedUrl = normalizeResearchUrl(source.normalizedUrl ?? source.url);
      const sourceUrl = normalizedUrl || source.url;
      const domain = source.domain?.trim() || getSafeHostname(sourceUrl);
      const classification = classifySource(
        {
          url: sourceUrl,
          title: source.title?.trim() || sourceUrl,
          domain,
          snippet: source.snippet?.trim(),
        },
        options,
      );
      const existing = this.sourcesByUrl.get(sourceUrl);
      const draftSource: DeepResearchSource = {
        id: existing?.id ?? `source:${randomUUID()}`,
        url: sourceUrl,
        normalizedUrl: sourceUrl,
        title: source.title?.trim() || sourceUrl,
        domain,
        snippet: source.snippet?.trim(),
        publishedAt: source.publishedAt,
        fetchedAt: existing?.fetchedAt ?? nowIso(),
        usedByStepIds: existing?.usedByStepIds ?? [stepId],
        status: classification.status,
        evidenceLevel: normalizeEvidenceLevel(source.evidenceLevel),
        fetchStatus: normalizeFetchStatus(source.fetchStatus),
        note: source.note?.trim() || classification.note,
      };
      draftSource.confidence = scoreSourceConfidence(draftSource);
      draftSource.tier = scoreSourceTier(draftSource);
      draftSource.excludeReason =
        draftSource.status === "related_but_excluded" ? draftSource.note : undefined;
      if (existing) {
        if (!existing.usedByStepIds.includes(stepId)) {
          existing.usedByStepIds.push(stepId);
        }
        const nextStatus = classification.status;
        const nextNote = source.note?.trim() || classification.note;
        const changed =
          (existing.status ?? "accepted") !== nextStatus ||
          (existing.note ?? "") !== (nextNote ?? "") ||
          (existing.confidence ?? "") !== draftSource.confidence ||
          (existing.tier ?? "") !== (draftSource.tier ?? "") ||
          (existing.evidenceLevel ?? "") !== (draftSource.evidenceLevel ?? "") ||
          (existing.fetchStatus ?? "") !== (draftSource.fetchStatus ?? "") ||
          (existing.normalizedUrl ?? existing.url) !== sourceUrl;
        existing.status = nextStatus;
        existing.note = nextNote;
        existing.url = sourceUrl;
        existing.normalizedUrl = sourceUrl;
        existing.title = draftSource.title;
        existing.domain = draftSource.domain;
        existing.snippet = draftSource.snippet;
        existing.publishedAt = draftSource.publishedAt;
        existing.evidenceLevel = draftSource.evidenceLevel;
        existing.fetchStatus = draftSource.fetchStatus;
        existing.confidence = scoreSourceConfidence(existing);
        existing.tier = scoreSourceTier(existing);
        existing.excludeReason =
          existing.status === "related_but_excluded" ? existing.note : undefined;
        if (changed) {
          await this.store.writeState(this.state);
          await this.emitDeepResearchEvent(
            {
              type: "deep_research_source",
              runId: this.runId,
              source: { ...existing },
              timestamp: nowIso(),
            },
            emit,
          );
        }
        continue;
      }

      const normalized: DeepResearchSource = {
        ...draftSource,
        id: `source:${randomUUID()}`,
      };
      this.sourcesByUrl.set(normalized.url, normalized);
      this.state.sources.push(normalized);
      await this.store.writeState(this.state);
      await this.emitDeepResearchEvent(
        {
          type: "deep_research_source",
          runId: this.runId,
          source: normalized,
          timestamp: nowIso(),
        },
        emit,
      );
    }
  }

  private async mergeArtifacts(
    stepId: string,
    artifacts: CoderOutput["artifacts"],
    emit: EmitFn,
  ): Promise<void> {
    for (const artifact of artifacts ?? []) {
      if (!artifact?.path?.startsWith("/workspace/")) continue;
      const hostArtifactPath = this.sandboxManager.translateToHostPath(
        this.options.sessionId,
        artifact.path,
      );
      const persistedDir = this.store.getArtifactsDir(this.runId);
      await mkdir(persistedDir, { recursive: true });
      const ext = artifact.path.includes(".")
        ? artifact.path.slice(artifact.path.lastIndexOf("."))
        : "";
      const persistedFilePath = join(
        persistedDir,
        `${Date.now()}-${slugifyTitle(artifact.title ?? artifact.path)}${ext}`,
      );
      await copyFile(hostArtifactPath, persistedFilePath).catch(() => {});

      const normalized: DeepResearchArtifact = {
        id: `artifact:${randomUUID()}`,
        path: artifact.path,
        storedFileName: persistedFilePath.split("/").pop(),
        title: artifact.title?.trim() || artifact.path.split("/").pop() || "Artifact",
        mimeType: artifact.mimeType?.trim() || guessMimeType(artifact.path),
        kind:
          artifact.kind === "text" ||
          artifact.kind === "table" ||
          artifact.kind === "chart" ||
          artifact.kind === "data" ||
          artifact.kind === "file"
            ? artifact.kind
            : guessArtifactKind(
                artifact.path,
                artifact.mimeType?.trim() || guessMimeType(artifact.path),
              ),
        createdAt: nowIso(),
        stepId,
      };
      this.state.artifacts.push(normalized);
      await this.store.writeState(this.state);
      await this.emitDeepResearchEvent(
        {
          type: "deep_research_artifact",
          runId: this.runId,
          artifact: normalized,
          timestamp: nowIso(),
        },
        emit,
      );
    }
  }

  private async generateReport(emit: EmitFn): Promise<string> {
    // Reporter sees the final curated evidence set, not the entire accepted
    // source pool. This is the last guardrail against weak or synthetic
    // citations leaking into the final answer.
    const reporter = defineAgent({
      id: "deep-research-reporter",
      name: "Deep Research Reporter",
      model: this.options.runtime.model,
      system: getReporterPrompt(new Date().toISOString().slice(0, 10)),
      maxTokens: 8192,
      temperature: 0.2,
    });

    const planText = JSON.stringify(this.state.plan, null, 2);
    const stepText = this.state.steps
      .map((step) => {
        const digest = step.digest ? `Digest:\n${formatStepDigest(step.digest)}` : "";
        return `Step ${step.index + 1}: [${step.type}] ${step.title}\n${digest}\n${
          step.summary ?? step.output ?? ""
        }`;
      })
      .join("\n\n");
    const reportSources = selectSourcesForReport(this.state.sources, 4);
    const sourceText = reportSources
      .map(
        (source) => `[${source.id}] ${source.title}
URL: ${source.normalizedUrl ?? source.url}
Tier: ${source.tier ?? "supporting"}
Confidence: ${source.confidence ?? "medium_confidence"}
Evidence: ${source.evidenceLevel ?? "unverified"}
Snippet: ${source.snippet ?? ""}`,
      )
      .join("\n\n");
    const evidenceRows = this.state.steps.flatMap((step) => step.evidenceTable ?? []);
    const evidenceText = evidenceRows
      .map(
        (row) =>
          `- Claim: ${row.claim}\n  Confidence: ${row.confidence}\n  Supporting sources: ${(
            row.supportingSourceIds ?? []
          ).join(", ")}${
            (row.conflicts ?? []).length > 0
              ? `\n  Conflicts: ${(row.conflicts ?? []).join(" | ")}`
              : ""
          }${(row.notes ?? []).length > 0 ? `\n  Notes: ${(row.notes ?? []).join(" | ")}` : ""}`,
      )
      .join("\n");
    const artifactText = this.state.artifacts
      .map((artifact) => `- ${artifact.title}: ${artifact.path} (${artifact.mimeType})`)
      .join("\n");
    const imageHints = this.state.artifacts
      .filter((artifact) => artifact.mimeType.startsWith("image/"))
      .map(
        (artifact) =>
          `![${artifact.title}](/api/sessions/${encodeURIComponent(
            this.options.sessionId,
          )}/deep-research/artifact?runId=${encodeURIComponent(
            this.runId,
          )}&artifactId=${encodeURIComponent(artifact.id)})`,
      )
      .join("\n");

    const prompt = [
      `Research query:\n${this.options.query}`,
      this.state.entityProfile
        ? `Context profile:\n${JSON.stringify(this.state.entityProfile, null, 2)}`
        : "",
      `Plan:\n${planText}`,
      `Step outputs:\n${stepText}`,
      evidenceText ? `Evidence table:\n${evidenceText}` : "",
      sourceText ? `Sources:\n${sourceText}` : "",
      artifactText ? `Artifacts:\n${artifactText}` : "",
      imageHints ? `Image embeds you may include if relevant:\n${imageHints}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    let report = "";
    for await (const event of reporter.stream(prompt)) {
      if ((event as RuntimeEvent).type === "message_update") {
        const update = event as Extract<RuntimeEvent, { type: "message_update" }>;
        if (update.event.type === "text_delta") {
          report += update.event.delta;
          this.state.reportMarkdown = report;
          this.state.run.updatedAt = nowIso();
          await this.store.writeState(this.state);
          await this.emitDeepResearchEvent(
            {
              type: "deep_research_report_delta",
              runId: this.runId,
              delta: update.event.delta,
              timestamp: nowIso(),
            },
            emit,
          );
          await emit({
            type: "message_update",
            event: {
              type: "text_delta",
              delta: update.event.delta,
              contentIndex: 0,
            },
          });
        }
      }
    }
    return sanitizeReportMarkdown(report.trim(), reportSources);
  }

  private mergeEntityProfile(
    outputProfile: ResearcherOutput["entityProfile"] | undefined,
    summary: string,
  ): string | undefined {
    // Planner owns the initial intent. Research can enrich that profile and,
    // in a narrow case, upgrade topic_scope -> entity_disambiguation when the
    // evidence clearly shows name ambiguity. We deliberately do not allow the
    // profile to drift back and forth on every step.
    const current = this.state.entityProfile ?? null;
    const fallbackProfile = deriveEntityProfile(this.options.query, summary, current);
    const researcherProfile = outputProfile
      ? normalizeResearchProfile(this.options.query, outputProfile, current, {
          source: "researcher_upgrade",
        })
      : null;
    const candidate = researcherProfile ?? fallbackProfile;

    if (!current && candidate) {
      this.state.entityProfile = normalizeResearchProfile(this.options.query, candidate, null, {
        source: candidate.source,
      });
      return undefined;
    }
    if (!current || !candidate) return undefined;

    let nextMode = current.mode;
    let profileUpdateReason: string | undefined;
    const shouldUpgradeToEntity =
      current.mode === "topic_scope" &&
      candidate.mode === "entity_disambiguation" &&
      !!candidate.officialName &&
      (candidate.excludedEntities.length > 0 || candidate.disambiguationNotes.length > 0);

    if (shouldUpgradeToEntity) {
      nextMode = "entity_disambiguation";
      profileUpdateReason = `Upgraded profile to entity disambiguation after finding explicit name ambiguity around ${candidate.officialName}.`;
    }

    const merged = normalizeResearchProfile(
      this.options.query,
      {
        ...candidate,
        mode: nextMode,
        source: shouldUpgradeToEntity ? "researcher_upgrade" : current.source,
        confidence: shouldUpgradeToEntity
          ? "medium"
          : (researcherProfile?.confidence ?? fallbackProfile?.confidence ?? current.confidence),
      },
      current,
      {
        preferredMode: nextMode,
        source: shouldUpgradeToEntity ? "researcher_upgrade" : current.source,
      },
    );

    if (current.mode === "entity_disambiguation") {
      merged.mode = "entity_disambiguation";
    }
    if (merged.mode === "topic_scope") {
      merged.excludedEntities = [];
    }

    this.state.entityProfile = merged;
    return profileUpdateReason;
  }

  private async refreshSourceClassifications(emit: EmitFn): Promise<void> {
    for (const source of this.state.sources) {
      const classification = classifySource(source, { entityProfile: this.state.entityProfile });
      const nextStatus = classification.status;
      const nextNote = classification.note ?? source.note;
      const nextConfidence = scoreSourceConfidence({
        ...source,
        status: nextStatus,
        note: nextNote,
      });
      const nextTier = scoreSourceTier({
        ...source,
        status: nextStatus,
        note: nextNote,
        confidence: nextConfidence,
      });
      if (
        (source.status ?? "accepted") === nextStatus &&
        (source.note ?? "") === (nextNote ?? "") &&
        (source.confidence ?? "") === nextConfidence &&
        (source.tier ?? "") === (nextTier ?? "")
      ) {
        continue;
      }
      source.status = nextStatus;
      source.note = nextNote;
      source.confidence = nextConfidence;
      source.tier = nextTier;
      source.excludeReason = nextStatus === "related_but_excluded" ? nextNote : undefined;
      await this.store.writeState(this.state);
      await this.emitDeepResearchEvent(
        {
          type: "deep_research_source",
          runId: this.runId,
          source: { ...source },
          timestamp: nowIso(),
        },
        emit,
      );
    }
  }
}

function normalizeEvidenceLevel(value?: string): DeepResearchSource["evidenceLevel"] {
  if (value === "body_verified" || value === "snippet_only" || value === "unverified") {
    return value;
  }
  return undefined;
}

function normalizeFetchStatus(value?: string): DeepResearchSource["fetchStatus"] {
  if (
    value === "success" ||
    value === "401" ||
    value === "403" ||
    value === "timeout" ||
    value === "empty_content" ||
    value === "error" ||
    value === "skipped"
  ) {
    return value;
  }
  return undefined;
}

function getSafeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
