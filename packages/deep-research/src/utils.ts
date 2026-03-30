/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import path from "node:path";
import type {
  DeepResearchArtifact,
  DeepResearchEntityProfile,
  DeepResearchEvidenceRow,
  DeepResearchFetchStatus,
  DeepResearchPlan,
  DeepResearchSource,
  DeepResearchSourceConfidence,
  DeepResearchSourceStatus,
  DeepResearchSourceTier,
  DeepResearchStep,
  DeepResearchStepDigest,
  PlannerOutput,
} from "./types.js";

/**
 * This file holds the "quality guardrails" for Deep Research.
 *
 * The coordinator is responsible for orchestration, but these helpers are the
 * place where we:
 * - normalize LLM output into stable internal shapes
 * - clean up noisy text before it pollutes later prompts
 * - keep source quality / evidence quality consistent across the run
 * - provide fallback behavior when a model output is incomplete or malformed
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Extract the first valid JSON object from a model response.
 *
 * Models often wrap JSON in prose or fenced code blocks. This helper keeps
 * trying progressively more defensive strategies so downstream code can work
 * with structured data instead of brittle free-form text.
 */
export function extractJsonObject<T>(text: string): T | null {
  const trimmed = text.trim();
  const direct = tryParseJson<T>(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParseJsonWithRepairs<T>(fenced[1].trim());
    if (parsed) return parsed;
  }

  const balanced = extractBalancedJsonObject(trimmed);
  if (balanced) {
    return tryParseJsonWithRepairs<T>(balanced);
  }

  return null;
}

function tryParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function tryParseJsonWithRepairs<T>(text: string): T | null {
  const direct = tryParseJson<T>(text);
  if (direct) return direct;

  const repaired = text
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
  return tryParseJson<T>(repaired);
}

function extractBalancedJsonObject(text: string): string | null {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

function inferStepType(description: string): "research" | "analysis" | "processing" {
  const text = description.toLowerCase();
  if (/(calculate|stat|compare|plot|chart|csv|json|python|aggregate|ratio|trend)/.test(text)) {
    return "processing";
  }
  if (/(search|find|source|web|news|crawl|look up|gather)/.test(text)) {
    return "research";
  }
  return "analysis";
}

/**
 * Planner output is the first structured decision point in the run.
 * We normalize both the step list and the initial research profile here so
 * every later stage receives a stable shape, even if the planner output is a
 * little incomplete.
 */
export function normalizePlan(query: string, plannerOutput: PlannerOutput | null): DeepResearchPlan {
  const fallback = buildFallbackPlan(query);
  if (!plannerOutput) return fallback;

  const normalizedSteps = (plannerOutput.steps ?? [])
    .slice(0, 6)
    .map((step) => {
      const title = step.title?.trim() || "Research Step";
      const description = step.description?.trim() || title;
      const rawType = step.type?.trim().toLowerCase();
      const type =
        rawType === "research" || rawType === "analysis" || rawType === "processing"
          ? rawType
          : inferStepType(`${title} ${description}`);
      return { type, title, description };
    })
    .filter((step) => step.title && step.description);

  const steps = normalizedSteps.length > 0 ? normalizedSteps : fallback.steps;
  if (!steps.some((step) => step.type === "research")) {
    steps.unshift({
      type: "research",
      title: "Gather Core Sources",
      description: `Search for high-quality external sources that directly answer: ${query}`,
    });
  }

  return {
    title: plannerOutput.title?.trim() || fallback.title,
    thought: plannerOutput.thought?.trim(),
    researchProfile: normalizeResearchProfile(query, plannerOutput.researchProfile, null),
    steps: steps.slice(0, 6),
  };
}

export function buildFallbackPlan(query: string): DeepResearchPlan {
  const processingNeeded = /(统计|对比|比较|趋势|比例|分布|chart|plot|trend|compare|stat|统计图|图表)/i.test(query);
  return {
    title: `Deep Research: ${query.slice(0, 60)}`,
    thought: "Collect external sources, synthesize them, and produce a sourced report.",
    researchProfile: normalizeResearchProfile(query, null, null),
    steps: [
      {
        type: "research",
        title: "Gather External Sources",
        description: `Search the web and collect reliable sources relevant to: ${query}`,
      },
      {
        type: processingNeeded ? "processing" : "analysis",
        title: processingNeeded ? "Process Data and Comparisons" : "Synthesize Findings",
        description: processingNeeded
          ? `Compute or compare the numerical evidence relevant to: ${query}`
          : `Compare, validate, and synthesize the findings relevant to: ${query}`,
      },
      {
        type: "analysis",
        title: "Identify Conclusions and Risks",
        description: `Summarize the strongest conclusions, caveats, and open questions for: ${query}`,
      },
    ],
  };
}

export function guessArtifactKind(filePath: string, mimeType: string): DeepResearchArtifact["kind"] {
  const ext = path.extname(filePath).toLowerCase();
  if (mimeType.startsWith("image/") || ext === ".png" || ext === ".svg") return "chart";
  if (ext === ".csv") return "table";
  if (ext === ".md" || ext === ".txt") return "text";
  if (ext === ".json") return "data";
  return "file";
}

export function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "artifact";
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, "\"");
}

export function normalizeResearchUrl(rawUrl: string): string {
  const trimmed = decodeHtmlEntities(rawUrl).replace(/\s+/g, "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function uniqueStrings(values: Array<string | undefined | null>, normalizer = normalizeWhitespace): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value ? normalizer(value) : "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s"'`“”‘’()（）\-_,.:;|/\\]+/g, "")
    .trim();
}

function stripMarkdown(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, " ")
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\|(?:[-: ]+\|)+\s*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/[*_>#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeDigestLine(text: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(text)
      .replace(/^\s*#{1,6}\s+/g, "")
      .replace(/^\s*\|(?:[-: ]+\|)+\s*$/g, "")
      .replace(/^\s*[-*+]\s+/g, "")
      .replace(/^\s*\d+\.\s+/g, "")
      .replace(/\[\^\d+\]/g, "")
      .replace(/\|/g, " "),
  );
}

function isNoiseLine(text: string): boolean {
  if (!text) return true;
  if (text.length < 18) return true;
  if (/^(title|summary|sources?|notes?|details?)[:：]?$/i.test(text)) return true;
  if (/^[\W_]+$/.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^\[[^\]]+\]\s*$/.test(text)) return true;
  if (/^"?(entityprofile|summary|sources|excludedsources)"?\s*:?$/i.test(text)) return true;
  return false;
}

function splitIntoSentences(text: string): string[] {
  return stripMarkdown(text)
    .split(/(?<=[。！？.!?])\s+/)
    .map((sentence) => sanitizeDigestLine(sentence))
    .filter((sentence) => !isNoiseLine(sentence));
}

function toCandidateLines(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => sanitizeDigestLine(line))
    .filter((line) => !isNoiseLine(line));

  return uniqueStrings([...lines, ...splitIntoSentences(text)], (value) => sanitizeDigestLine(value));
}

function compressAtomicLines(lines: string[], limit: number): string[] {
  const accepted: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const normalized = line
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .slice(0, 120);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    accepted.push(line.length > 220 ? `${line.slice(0, 217).trimEnd()}...` : line);
    if (accepted.length >= limit) break;
  }
  return accepted;
}

function extractOfficialName(summary: string, query: string): string | null {
  const patterns = [
    /正式名称(?:为|：)\s*["“]?([^"”\n]+?公司)/u,
    /企业全称(?:\s*[*：:]|\s+)\s*([^|\n]+?公司)/u,
    /^##\s*([^—\n]+?(?:公司|Inc\.|Corp\.|Corporation))\s*[—-]/mu,
    /统一社会信用代码[\s\S]{0,120}?([^|\n]+?公司)/u,
  ];
  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match?.[1]) {
      return sanitizeDigestLine(match[1].replace(/\*\*/g, ""));
    }
  }

  const queryMatch = query.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]+?(?:公司|集团|企业|Inc\.|Corp\.|Corporation))/u);
  return queryMatch?.[1]?.trim() ?? null;
}

function extractExcludedEntities(summary: string): string[] {
  const patterns = [
    /与["“]?([^"”\n]{2,80}?)["”]?(?:（|\(|的区分|是|相比)/gu,
    /不同于["“]?([^"”\n]{2,80}?)["”]?/gu,
    /区分["“]?([^"”\n]{2,80}?)["”]?/gu,
  ];
  const results: string[] = [];
  for (const pattern of patterns) {
    for (const match of summary.matchAll(pattern)) {
      if (match[1]) results.push(sanitizeDigestLine(match[1]));
    }
  }
  return uniqueStrings(results);
}

function extractRelatedEntities(summary: string): string[] {
  const entities: string[] = [];
  const patterns = [
    /(Anthropic|Google DeepMind|DeepMind|xAI|Microsoft|Meta|Amazon|Apple|Perplexity|BYD|Waymo|Volkswagen|BMW|Ford|GM|Rivian|NIO|Xpeng|Xiaomi)/gi,
    /(?:竞争对手|竞品|同行|对比对象)[：:]\s*([^\n]+)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of summary.matchAll(pattern)) {
      if (match[1]) entities.push(sanitizeDigestLine(match[1]));
    }
  }
  return uniqueStrings(entities);
}

function extractAliases(query: string, summary: string, officialName?: string): string[] {
  const candidates: string[] = [];
  const queryName = query.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-.]+?(?:公司|集团|企业|Inc\.|Corp\.|Corporation))/u)?.[1];
  if (queryName) candidates.push(queryName);

  const mentionMatches = summary.matchAll(/["“]([^"”\n]{2,60}?(?:公司|集团|企业|Inc\.|Corp\.|Corporation))["”]/gu);
  for (const match of mentionMatches) {
    if (match[1]) candidates.push(match[1]);
  }

  return uniqueStrings(candidates).filter((name) => normalizeName(name) !== normalizeName(officialName ?? ""));
}

function sanitizeScopeTerms(values: string[]): string[] {
  return uniqueStrings(values)
    .map((item) => sanitizeDigestLine(item))
    .filter((item) =>
      item.length >= 2 &&
      item.length <= 48 &&
      !/[{}[\]]/.test(item) &&
      !/^"(summary|entityProfile|sources?)"/i.test(item) &&
      !/\\n/.test(item),
    )
    .slice(0, 10);
}

function deriveScopeTerms(query: string, summary: string): string[] {
  const phrases = [
    ...query.split(/[，。,、;；]/),
    ...summary.match(/(?:市场|产品|预测|趋势|反馈|增长|份额|营收|竞争|采用|技术|自动驾驶|机器人|电池|储能)[^\n。；;]{0,24}/gu) ?? [],
  ];
  return sanitizeScopeTerms(phrases);
}

function inferProfileModeFromQuery(query: string): DeepResearchEntityProfile["mode"] {
  return /(公司|集团|主体|法定代表人|统一社会信用代码|工商|注册资本|运营状况|资质|认证|同名|企业全称|企业名称)/u.test(query)
    ? "entity_disambiguation"
    : "topic_scope";
}

function sanitizeProfileConfidence(value?: string): DeepResearchEntityProfile["confidence"] {
  return value === "high" || value === "medium" ? value : "low";
}

function sanitizeProfileSource(
  value?: string,
  fallback: DeepResearchEntityProfile["source"] = "fallback_rules",
): DeepResearchEntityProfile["source"] {
  if (value === "planner" || value === "researcher_upgrade" || value === "fallback_rules") {
    return value;
  }
  return fallback;
}

/**
 * Normalize a planner/researcher supplied profile into a safe internal shape.
 *
 * This is the main "LLM output -> stable data model" entrypoint. We let the
 * LLM decide the intent, then sanitize aggressively so that malformed terms do
 * not poison later prompts.
 */
export function normalizeResearchProfile(
  query: string,
  profile:
    | PlannerOutput["researchProfile"]
    | {
        mode?: "entity_disambiguation" | "topic_scope";
        officialName?: string;
        aliases?: string[];
        scopeTerms?: string[];
        disambiguationNotes?: string[];
        excludedEntities?: string[];
        relatedEntities?: string[];
        confidence?: "high" | "medium" | "low";
        source?: "planner" | "researcher_upgrade" | "fallback_rules";
      }
    | null
    | undefined,
  existing?: DeepResearchEntityProfile | null,
  options?: {
    preferredMode?: DeepResearchEntityProfile["mode"];
    source?: DeepResearchEntityProfile["source"];
  },
): DeepResearchEntityProfile {
  const mode = options?.preferredMode
    ?? profile?.mode
    ?? existing?.mode
    ?? inferProfileModeFromQuery(query);
  const officialName = sanitizeDigestLine(profile?.officialName ?? existing?.officialName ?? "");

  return {
    mode,
    officialName: officialName || undefined,
    aliases: uniqueStrings([...(existing?.aliases ?? []), ...(profile?.aliases ?? [])])
      .map((item) => sanitizeDigestLine(item))
      .filter((item) => item.length >= 2 && item.length <= 80 && !/[{}[\]]/.test(item))
      .slice(0, 8),
    scopeTerms: sanitizeScopeTerms([...(existing?.scopeTerms ?? []), ...(profile?.scopeTerms ?? [])]),
    disambiguationNotes: compressAtomicLines(
      uniqueStrings([...(existing?.disambiguationNotes ?? []), ...(profile?.disambiguationNotes ?? [])])
        .map((item) => sanitizeDigestLine(item))
        .filter(Boolean),
      6,
    ),
    excludedEntities: mode === "entity_disambiguation"
      ? uniqueStrings([...(existing?.excludedEntities ?? []), ...(profile?.excludedEntities ?? [])])
        .map((item) => sanitizeDigestLine(item))
        .filter((item) => item.length >= 2 && item.length <= 80)
        .slice(0, 8)
      : [],
    relatedEntities: uniqueStrings([...(existing?.relatedEntities ?? []), ...(profile?.relatedEntities ?? [])])
      .map((item) => sanitizeDigestLine(item))
      .filter((item) => item.length >= 2 && item.length <= 80)
      .slice(0, 12),
    confidence: sanitizeProfileConfidence(profile?.confidence ?? existing?.confidence),
    source: sanitizeProfileSource(profile?.source ?? options?.source, options?.source ?? existing?.source ?? "fallback_rules"),
  };
}

/**
 * `deriveEntityProfile` is now the fallback path.
 *
 * It no longer decides the main intent for the whole run. Instead, it tries to
 * salvage useful profile hints from an already-produced summary when the
 * planner or researcher omitted fields.
 */
export function deriveEntityProfile(
  query: string,
  summary: string,
  existing?: DeepResearchEntityProfile | null,
): DeepResearchEntityProfile | null {
  const preferredMode = existing?.mode ?? inferProfileModeFromQuery(query);
  const officialName = preferredMode === "entity_disambiguation"
    ? extractOfficialName(summary, query) ?? existing?.officialName
    : existing?.officialName;
  const aliases = extractAliases(query, summary, officialName);
  const scopeTerms = deriveScopeTerms(query, summary);
  const disambiguationNotes = uniqueStrings(
    toCandidateLines(summary).filter((line) =>
      /(正式名称|可能为同一实体|不同实体|区分|同名|无“|无"|核实|命名)/u.test(line),
    ).slice(0, 4),
  );
  const excludedEntities = preferredMode === "entity_disambiguation"
    ? extractExcludedEntities(summary)
    : [];
  const relatedEntities = preferredMode === "topic_scope"
    ? extractRelatedEntities(summary)
    : [];

  if (!officialName && aliases.length === 0 && scopeTerms.length === 0 && disambiguationNotes.length === 0) {
    return existing ?? null;
  }

  return normalizeResearchProfile(
    query,
    {
      mode: preferredMode,
      officialName: officialName ?? undefined,
      aliases,
      scopeTerms,
      disambiguationNotes,
      excludedEntities,
      relatedEntities,
      confidence: existing?.confidence ?? "low",
      source: "fallback_rules",
    },
    existing,
    { preferredMode, source: "fallback_rules" },
  );
}

function computeDigestConfidence(
  sources: DeepResearchSource[],
  findingsCount: number,
): "high" | "medium" | "low" {
  const hasHigh = sources.some((source) => source.confidence === "high_confidence");
  const hasVerified = sources.some((source) => source.evidenceLevel === "body_verified");
  if (hasHigh && hasVerified && findingsCount >= 2) return "high";
  if (findingsCount >= 1 && sources.length >= 1) return "medium";
  return "low";
}

/**
 * Digests are intentionally compact because they become prompt context for
 * later steps. The whole point is to carry forward the strongest conclusions
 * without dragging full markdown reports into every subsequent prompt.
 */
export function buildStepDigest(
  step: DeepResearchStep,
  sources: DeepResearchSource[],
): DeepResearchStepDigest | undefined {
  const text = step.summary ?? step.output ?? "";
  if (!text.trim()) return undefined;

  const candidates = toCandidateLines(text);
  const findings = compressAtomicLines(
    candidates.filter((line) => !/(待确认|仍需|open question|unknown|未知|不确定|可能|尚未|未披露|未证实)/i.test(line)),
    5,
  );
  const openQuestions = compressAtomicLines(
    candidates.filter((line) => /(待确认|仍需|建议.*核实|open question|uncertain|未查到|未披露|可能|不确定|仍待)/i.test(line)),
    3,
  );

  return {
    stepId: step.id,
    title: step.title,
    type: step.type,
    findings,
    sourceIds: sources.map((source) => source.id).slice(0, 5),
    openQuestions,
    confidence: computeDigestConfidence(sources, findings.length),
  };
}

export function formatStepDigest(digest: DeepResearchStepDigest): string {
  const findings = digest.findings.length > 0
    ? digest.findings.map((finding) => `- ${finding}`).join("\n")
    : "- No key findings recorded yet.";
  const openQuestions = digest.openQuestions.length > 0
    ? `Open questions:\n${digest.openQuestions.map((item) => `- ${item}`).join("\n")}`
    : "";

  return [
    `[${digest.type}] ${digest.title}`,
    `Confidence: ${digest.confidence}`,
    "Key findings:",
    findings,
    openQuestions,
  ]
    .filter(Boolean)
    .join("\n");
}

function classifyAgainstProfile(
  text: string,
  profile?: DeepResearchEntityProfile | null,
): { status: DeepResearchSourceStatus; note?: string } {
  if (!profile || profile.mode !== "entity_disambiguation") {
    return { status: "accepted" };
  }

  const haystack = normalizeName(text);
  const officialNames = [profile.officialName, ...(profile.aliases ?? [])]
    .map((name) => normalizeName(name ?? ""))
    .filter(Boolean);
  const excludedNames = (profile.excludedEntities ?? [])
    .map((name) => normalizeName(name))
    .filter(Boolean);

  const mentionsOfficial = officialNames.some((name) => haystack.includes(name));
  const matchedExcluded = excludedNames.find((name) => haystack.includes(name));

  if (matchedExcluded && !mentionsOfficial) {
    const originalName = profile.excludedEntities.find((name) => normalizeName(name) === matchedExcluded) ?? matchedExcluded;
    return {
      status: "related_but_excluded",
      note: `Matched excluded entity: ${originalName}`,
    };
  }

  return { status: "accepted" };
}

export function scoreSourceConfidence(source: DeepResearchSource): DeepResearchSourceConfidence {
  const domain = source.domain.toLowerCase();
  let score = 0;

  if (/^(www\.)?(openai|tesla)\.com$/.test(domain)) score += 20;
  if (/(reuters\.com|bloomberg\.com|ft\.com|fortune\.com|cnbc\.com|wsj\.com|nytimes\.com|bbc\.com|techcrunch\.com|arstechnica\.com)/.test(domain)) score += 14;
  if (/(sec\.gov|gov\.cn|gov$|europa\.eu|arxiv\.org|github\.com|theicct\.org)/.test(domain)) score += 12;
  if (/(menlovc\.com|a16z\.com|cbinsights\.com|pitchbook\.com|statista\.com|gallup\.com|gartner\.com|autovistagroup\.com|coxautoinc\.com)/.test(domain)) score += 8;
  if (/(reddit\.com|polymarket\.com|manifold\.markets|medium\.com|substack\.com|blogspot\.com|wordpress\.com)/.test(domain)) score -= 14;
  if (/(trading|investorplace|windowsforum|taptwice|ai-supremacy|usama\.codes|futuresearch|bullfincher|basenor|teslahubs|teslarati)/.test(domain)) score -= 8;
  if (/\.pdf($|\?)/i.test(source.url)) score -= 2;
  if (source.usedByStepIds.length > 1) score += 2;
  if (source.evidenceLevel === "body_verified") score += 8;
  if (source.evidenceLevel === "snippet_only") score -= 6;
  if (source.fetchStatus === "success") score += 3;
  if (source.fetchStatus && source.fetchStatus !== "success") score -= 5;
  if (source.status === "related_but_excluded") score -= 100;

  if (source.evidenceLevel === "snippet_only" && score > 15) {
    return "medium_confidence";
  }
  if (score >= 18) return "high_confidence";
  if (score >= 8) return "medium_confidence";
  return "low_confidence";
}

export function scoreSourceTier(source: DeepResearchSource): DeepResearchSourceTier | undefined {
  if ((source.status ?? "accepted") !== "accepted") return undefined;
  if (source.confidence === "high_confidence") return "primary";
  if (source.confidence === "medium_confidence" && source.evidenceLevel === "body_verified") return "primary";
  return "supporting";
}

export function classifySource(
  source: Pick<DeepResearchSource, "url" | "title" | "domain" | "snippet">,
  options?: {
    entityProfile?: DeepResearchEntityProfile | null;
    explicitExcludedUrls?: Set<string>;
    note?: string;
  },
): { status: DeepResearchSourceStatus; note?: string } {
  const normalizedUrl = normalizeResearchUrl(source.url);
  if (options?.explicitExcludedUrls?.has(normalizedUrl) || options?.explicitExcludedUrls?.has(source.url)) {
    return {
      status: "related_but_excluded",
      note: options.note ?? "Explicitly excluded by researcher due to entity mismatch",
    };
  }

  const combined = `${source.title} ${source.domain} ${source.snippet ?? ""} ${source.url}`;
  const byProfile = classifyAgainstProfile(combined, options?.entityProfile);
  if (byProfile.status === "related_but_excluded") return byProfile;

  return {
    status: "accepted",
    note: options?.note,
  };
}

function scoreKnownSource(source: DeepResearchSource, queryText = ""): number {
  let score = 0;
  if (source.status === "accepted") score += 12;
  if (source.tier === "primary") score += 18;
  if (source.confidence === "high_confidence") score += 20;
  if (source.confidence === "medium_confidence") score += 9;
  if (source.evidenceLevel === "body_verified") score += 8;
  if (source.evidenceLevel === "snippet_only") score -= 4;
  if (source.fetchStatus === "success") score += 2;
  const haystack = `${source.title} ${source.snippet ?? ""} ${source.domain}`.toLowerCase();
  const queryTerms = queryText
    .toLowerCase()
    .split(/[\s,，。:：/]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 12);
  score += queryTerms.filter((term) => haystack.includes(term)).length;
  return score;
}

/**
 * Research steps should see only the strongest prior evidence, not the entire
 * historical source pool. This keeps prompts short and also nudges later steps
 * toward better-quality references.
 */
export function selectSourcesForResearchContext(
  sources: DeepResearchSource[],
  queryText = "",
  maxPrimary = 8,
  maxSupporting = 4,
): DeepResearchSource[] {
  const accepted = [...sources]
    .filter((source) => (source.status ?? "accepted") === "accepted")
    .sort((left, right) => scoreKnownSource(right, queryText) - scoreKnownSource(left, queryText));
  const primary = accepted.filter((source) => source.tier === "primary").slice(0, maxPrimary);
  const selectedIds = new Set(primary.map((source) => source.id));
  const supporting = accepted
    .filter((source) => source.tier === "supporting" && !selectedIds.has(source.id))
    .slice(0, maxSupporting);
  return [...primary, ...supporting];
}

export function selectSourcesForReport(
  sources: DeepResearchSource[],
  maxSupporting = 4,
): DeepResearchSource[] {
  const accepted = sources
    .filter((source) => (source.status ?? "accepted") === "accepted")
    .sort((left, right) => scoreKnownSource(right) - scoreKnownSource(left));
  const primary = accepted.filter((source) => source.tier === "primary");
  const primaryIds = new Set(primary.map((source) => source.id));
  const supporting = accepted
    .filter((source) => source.tier === "supporting" && !primaryIds.has(source.id))
    .slice(0, maxSupporting);
  return [...primary, ...supporting];
}

export function buildFetchDomainBudget(
  sources: DeepResearchSource[],
): Record<string, Record<DeepResearchFetchStatus, number>> {
  const budget: Record<string, Record<DeepResearchFetchStatus, number>> = {};
  for (const source of sources) {
    const domain = source.domain.toLowerCase();
    const status = source.fetchStatus;
    if (!domain || !status) continue;
    budget[domain] ??= {
      success: 0,
      "401": 0,
      "403": 0,
      timeout: 0,
      empty_content: 0,
      error: 0,
      skipped: 0,
    };
    budget[domain][status] += 1;
  }
  return budget;
}

export function selectBlockedFetchDomains(sources: DeepResearchSource[]): string[] {
  const budget = buildFetchDomainBudget(sources);
  return Object.entries(budget)
    .filter(([, stats]) => stats["401"] >= 2 || stats["403"] >= 2)
    .map(([domain]) => domain)
    .sort();
}

export function normalizeEvidenceTable(
  rows: DeepResearchEvidenceRow[] | undefined,
  availableSources: DeepResearchSource[],
): DeepResearchEvidenceRow[] {
  if (!rows?.length) return [];
  const allowedSourceIds = new Set(availableSources.map((source) => source.id));
  return rows
    .map((row) => {
      const confidence: DeepResearchEvidenceRow["confidence"] =
        row.confidence === "high" || row.confidence === "medium" ? row.confidence : "low";
      return {
        claim: sanitizeDigestLine(row.claim),
        supportingSourceIds: uniqueStrings(row.supportingSourceIds ?? [])
          .filter((sourceId) => allowedSourceIds.has(sourceId))
          .slice(0, 5),
        confidence,
        conflicts: compressAtomicLines((row.conflicts ?? []).map((item) => sanitizeDigestLine(item)).filter(Boolean), 3),
        notes: compressAtomicLines((row.notes ?? []).map((item) => sanitizeDigestLine(item)).filter(Boolean), 3),
      };
    })
    .filter((row) => row.claim && row.supportingSourceIds.length > 0)
    .slice(0, 12);
}

/**
 * When a researcher output is malformed, we still try to recover the actual
 * markdown report section so later steps do not inherit a raw JSON blob.
 */
export function sanitizeResearchSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return "";

  const strippedFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  if (/^Based on my research/i.test(trimmed) && /```(?:json)?/i.test(trimmed)) {
    const maybeObject = extractJsonObject<{ summary?: string }>(trimmed);
    if (maybeObject?.summary) {
      return maybeObject.summary.trim();
    }
  }

  if (/^"\s*##/.test(strippedFence)) {
    try {
      return JSON.parse(strippedFence) as string;
    } catch {
      return strippedFence;
    }
  }

  return trimmed;
}

export function extractResearcherSummaryFallback(outputText: string): string | null {
  const json = extractJsonObject<{ summary?: string }>(outputText);
  if (json?.summary?.trim()) return sanitizeResearchSummary(json.summary);

  const summaryMatch = outputText.match(/"summary"\s*:\s*"([\s\S]+?)"\s*(?:,\s*"(?:entityProfile|sources|excludedSources)"|\})/);
  if (!summaryMatch?.[1]) return null;
  try {
    return JSON.parse(`"${summaryMatch[1]}"`);
  } catch {
    return sanitizeResearchSummary(summaryMatch[1].replace(/\\"/g, "\""));
  }
}

export function sanitizeReportMarkdown(
  markdown: string,
  allowedSources: DeepResearchSource[],
): string {
  const allowedUrls = new Set(
    allowedSources
      .map((source) => source.normalizedUrl ?? source.url)
      .filter(Boolean),
  );
  const keptFootnotes = new Set<string>();

  const lines = markdown
    .split("\n")
    .filter((line) => {
      const match = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
      if (!match) return true;
      const [, id, body] = match;
      const urlMatch = body.match(/https?:\/\/\S+/);
      if (!urlMatch) return false;
      const normalizedUrl = normalizeResearchUrl(urlMatch[0]);
      if (!allowedUrls.has(normalizedUrl)) return false;
      keptFootnotes.add(id);
      return true;
    });

  return lines
    .map((line) =>
      line.replace(/\[\^([^\]]+)\]/g, (full, id: string) => (keptFootnotes.has(id) ? full : "")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
