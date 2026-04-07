/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildKnowledgeMetadata,
  buildTopicSummaries,
  ensureJsonFile,
  listIndexTopics,
  readJsonFileOrDefault,
  removeDocumentReferencesFromIndexes,
  replaceIndexDocumentPaths,
  writeJsonFile,
} from "./knowledge-manager-helpers.js";
import type {
  IngestionJob,
  IngestionStep,
  KBDocMeta,
  KBMetadata,
  KnowledgeIndex,
  SearchResult,
  Taxonomy,
} from "./types.js";

const execFileAsync = promisify(execFile);

const INGESTION_STEPS: IngestionStep[] = [
  "analyze",
  "classify",
  "summarize",
  "index_update",
  "register",
];

/**
 * Filesystem-backed knowledge-base manager.
 *
 * Each knowledge base lives under
 * `{dataDir}/tenants/{tenantId}/knowledge_bases/{kbId}`.
 *
 * @see {@link https://agentrail.run/guides/use-capability-packages}
 */
export class KnowledgeManager {
  constructor(private readonly dataDir: string) {}

  /** Returns the absolute directory path for a knowledge base. */
  getKbDir(tenantId: string, kbId: string): string {
    return path.join(this.dataDir, "tenants", tenantId, "knowledge_bases", kbId);
  }

  private getKbsDir(tenantId: string): string {
    return path.join(this.dataDir, "tenants", tenantId, "knowledge_bases");
  }

  /** Lists all knowledge-base IDs for a tenant. */
  async listKbs(tenantId: string): Promise<string[]> {
    const kbsDir = this.getKbsDir(tenantId);
    try {
      const entries = await fs.readdir(kbsDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  /** Permanently removes a knowledge base and all of its documents and jobs. */
  async deleteKb(tenantId: string, kbId: string): Promise<void> {
    const kbDir = this.getKbDir(tenantId, kbId);
    await fs.rm(kbDir, { recursive: true, force: true });
  }

  /** Creates the directory structure and metadata files for a new knowledge base. */
  async initKb(tenantId: string, kbId: string): Promise<void> {
    const kbDir = this.getKbDir(tenantId, kbId);
    await fs.mkdir(path.join(kbDir, "docs"), { recursive: true });
    await fs.mkdir(path.join(kbDir, "pending"), { recursive: true });
    await fs.mkdir(path.join(kbDir, "indexes"), { recursive: true });
    await fs.mkdir(path.join(kbDir, "jobs"), { recursive: true });

    await ensureJsonFile(path.join(kbDir, "taxonomy.json"), {});
    await ensureJsonFile(path.join(kbDir, "docs.json"), []);

    await this.rebuildMetadata(tenantId, kbId);
  }

  /** Stores a newly uploaded raw document in the knowledge base's pending area. */
  async storeRawDocument(
    tenantId: string,
    kbId: string,
    input: { title: string; content: string },
  ): Promise<{ docId: string }> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docId = randomUUID();
    const pendingPath = path.join(kbDir, "pending", `${docId}.md`);
    const header = `# ${input.title}\n\n`;
    await fs.writeFile(pendingPath, header + input.content, "utf-8");

    const docs = await this.readDocsJson(kbDir);
    const now = Date.now();
    const meta: KBDocMeta = {
      docId,
      title: input.title,
      status: "pending",
      category: [],
      topics: [],
      summary: null,
      path: path.join("pending", `${docId}.md`),
      sizeTokensApprox: Math.ceil((header + input.content).length / 4),
      createdAt: now,
      updatedAt: now,
    };
    docs.push(meta);
    await this.writeDocsJson(kbDir, docs);
    return { docId };
  }

  /** Promotes a pending document into the indexed docs tree with final metadata. */
  async finalizeDocument(
    tenantId: string,
    kbId: string,
    docId: string,
    meta: Pick<KBDocMeta, "category" | "topics" | "summary">,
  ): Promise<KBDocMeta> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docs = await this.readDocsJson(kbDir);
    const existing = docs.find((d) => d.docId === docId);
    if (!existing) throw new Error(`Document ${docId} not found`);

    const categoryDir = path.join(kbDir, "docs", ...meta.category);
    await fs.mkdir(categoryDir, { recursive: true });

    const pendingPath = path.join(kbDir, existing.path);
    const finalRelPath = path.join("docs", ...meta.category, `${docId}.md`);
    const finalPath = path.join(kbDir, finalRelPath);

    // Prepend summary comment to file (without rewriting full content via LLM)
    if (meta.summary) {
      const original = await fs.readFile(pendingPath, "utf-8");
      const withSummary = `<!-- summary: ${meta.summary} -->\n${original}`;
      await fs.writeFile(pendingPath, withSummary, "utf-8");
    }

    await fs.rename(pendingPath, finalPath);

    // Fix any index references that still point to the pending path
    await this.fixIndexPaths(kbDir, `pending/${docId}.md`, finalRelPath.replace(/\\/g, "/"));

    const now = Date.now();
    Object.assign(existing, {
      ...meta,
      status: "ready",
      path: finalRelPath,
      updatedAt: now,
    });
    await this.writeDocsJson(kbDir, docs);
    await this.rebuildMetadata(tenantId, kbId);
    return existing;
  }

  /** Creates an ingestion job that tracks document-processing progress. */
  async createJob(tenantId: string, kbId: string, docId: string): Promise<IngestionJob> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const jobId = randomUUID();
    const now = Date.now();
    const job: IngestionJob = {
      jobId,
      docId,
      status: "pending",
      steps: INGESTION_STEPS.map((step) => ({ step, status: "pending" })),
      createdAt: now,
      updatedAt: now,
    };
    await fs.writeFile(
      path.join(kbDir, "jobs", `${jobId}.json`),
      JSON.stringify(job, null, 2),
      "utf-8",
    );
    return job;
  }

  async updateJob(
    tenantId: string,
    kbId: string,
    jobId: string,
    patch: Partial<Omit<IngestionJob, "jobId" | "docId" | "createdAt" | "updatedAt">>,
  ): Promise<void> {
    const job = await this.getJob(tenantId, kbId, jobId);
    Object.assign(job, { ...patch, updatedAt: Date.now() });
    const kbDir = this.getKbDir(tenantId, kbId);
    await fs.writeFile(
      path.join(kbDir, "jobs", `${jobId}.json`),
      JSON.stringify(job, null, 2),
      "utf-8",
    );
  }

  async getJob(tenantId: string, kbId: string, jobId: string): Promise<IngestionJob> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const raw = await fs.readFile(path.join(kbDir, "jobs", `${jobId}.json`), "utf-8");
    return JSON.parse(raw) as IngestionJob;
  }

  async removeDocument(tenantId: string, kbId: string, docId: string): Promise<void> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docs = await this.readDocsJson(kbDir);
    const idx = docs.findIndex((d) => d.docId === docId);
    if (idx === -1) return;
    const [removed] = docs.splice(idx, 1);

    const filePath = path.join(kbDir, removed.path);
    await fs.rm(filePath, { force: true });
    await removeDocumentReferencesFromIndexes(path.join(kbDir, "indexes"), docId);

    await this.writeDocsJson(kbDir, docs);
    await this.rebuildMetadata(tenantId, kbId);
  }

  async getDocument(
    tenantId: string,
    kbId: string,
    docId: string,
  ): Promise<{ meta: KBDocMeta; content: string }> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docs = await this.readDocsJson(kbDir);
    const meta = docs.find((d) => d.docId === docId);
    if (!meta) throw new Error(`Document ${docId} not found`);
    const content = await fs.readFile(path.join(kbDir, meta.path), "utf-8");
    return { meta, content };
  }

  async listDocuments(tenantId: string, kbId: string, category?: string): Promise<KBDocMeta[]> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docs = await this.readDocsJson(kbDir);
    if (!category) return docs;
    return docs.filter((d) => d.category.includes(category));
  }

  async search(
    tenantId: string,
    kbId: string,
    pattern: string,
    opts?: { maxResults?: number; contextLines?: number },
  ): Promise<SearchResult[]> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docsDir = path.join(kbDir, "docs");
    const maxResults = opts?.maxResults ?? 20;
    const contextLines = opts?.contextLines ?? 2;

    let stdout = "";
    try {
      const result = await execFileAsync("rg", [
        "--json",
        `-C${contextLines}`,
        "-m",
        String(maxResults),
        pattern,
        docsDir,
      ]);
      stdout = result.stdout;
    } catch (err: unknown) {
      // rg exits with code 1 when no matches found
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: unknown }).code === 1
      ) {
        return [];
      }
      throw err;
    }

    const results: SearchResult[] = [];
    const docs = await this.readDocsJson(kbDir);

    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object" || (parsed as { type?: string }).type !== "match")
        continue;
      const match = parsed as {
        type: string;
        data: {
          path: { text: string };
          lines: { text: string };
          line_number: number;
          submatches: unknown[];
          context_before?: Array<{ lines: { text: string } }>;
          context_after?: Array<{ lines: { text: string } }>;
        };
      };
      const filePath = match.data.path.text;
      const relPath = path.relative(kbDir, filePath);
      const docId = docs.find((d) => d.path === relPath)?.docId ?? path.basename(filePath, ".md");
      const context: string[] = [
        ...(match.data.context_before?.map((c) => c.lines.text.trimEnd()) ?? []),
        ...(match.data.context_after?.map((c) => c.lines.text.trimEnd()) ?? []),
      ];
      results.push({
        docId,
        path: relPath,
        lineNumber: match.data.line_number,
        line: match.data.lines.text.trimEnd(),
        context,
      });
    }

    return results;
  }

  async getIndex(tenantId: string, kbId: string, topic: string): Promise<string | null> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const indexPath = path.join(kbDir, "indexes", `${topic}_index.md`);
    try {
      return await fs.readFile(indexPath, "utf-8");
    } catch {
      return null;
    }
  }

  async upsertIndex(tenantId: string, kbId: string, topic: string, content: string): Promise<void> {
    const kbDir = this.getKbDir(tenantId, kbId);
    await fs.writeFile(path.join(kbDir, "indexes", `${topic}_index.md`), content, "utf-8");
  }

  async getTaxonomy(tenantId: string, kbId: string): Promise<Taxonomy> {
    const kbDir = this.getKbDir(tenantId, kbId);
    return readJsonFileOrDefault(path.join(kbDir, "taxonomy.json"), {});
  }

  async upsertTaxonomy(tenantId: string, kbId: string, taxonomy: Taxonomy): Promise<void> {
    const kbDir = this.getKbDir(tenantId, kbId);
    await writeJsonFile(path.join(kbDir, "taxonomy.json"), taxonomy);
  }

  async buildKnowledgeIndex(tenantId: string, kbId: string): Promise<KnowledgeIndex> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docs = await this.readDocsJson(kbDir);
    const taxonomy = await this.getTaxonomy(tenantId, kbId);
    const indexTopics = await listIndexTopics(kbDir);

    return {
      kbId,
      kbDir,
      documentCount: docs.filter((d) => d.status === "ready").length,
      taxonomy,
      topics: buildTopicSummaries(docs, indexTopics),
    };
  }

  async getMetadata(tenantId: string, kbId: string): Promise<KBMetadata | null> {
    const kbDir = this.getKbDir(tenantId, kbId);
    try {
      return await readJsonFileOrDefault<KBMetadata | null>(
        path.join(kbDir, "metadata.json"),
        null,
      );
    } catch {
      return null;
    }
  }

  async rebuildMetadata(tenantId: string, kbId: string): Promise<KBMetadata> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docs = await this.readDocsJson(kbDir);
    const taxonomy = await this.getTaxonomy(tenantId, kbId);
    const metadata = await buildKnowledgeMetadata({
      kbId,
      kbDir,
      docs,
      taxonomy,
    });
    await writeJsonFile(path.join(kbDir, "metadata.json"), metadata);

    return metadata;
  }

  async updateDocStatus(
    tenantId: string,
    kbId: string,
    docId: string,
    status: KBDocMeta["status"],
  ): Promise<void> {
    const kbDir = this.getKbDir(tenantId, kbId);
    const docs = await this.readDocsJson(kbDir);
    const doc = docs.find((d) => d.docId === docId);
    if (doc) {
      doc.status = status;
      doc.updatedAt = Date.now();
      await this.writeDocsJson(kbDir, docs);
    }
  }

  /**
   * After a document is moved from pending/ to docs/, update all index files
   * that still reference the old path segment.
   * Index files use paths relative to kbDir (e.g. ../pending/x.md from indexes/).
   * We normalise both sides to forward-slash kbDir-relative paths for matching.
   */
  private async fixIndexPaths(
    kbDir: string,
    oldRelPath: string, // e.g. "pending/{docId}.md"
    newRelPath: string, // e.g. "docs/AI/RAG/{docId}.md"
  ): Promise<void> {
    await replaceIndexDocumentPaths(path.join(kbDir, "indexes"), kbDir, oldRelPath, newRelPath);
  }

  private async readDocsJson(kbDir: string): Promise<KBDocMeta[]> {
    return readJsonFileOrDefault(path.join(kbDir, "docs.json"), []);
  }

  private async writeDocsJson(kbDir: string, docs: KBDocMeta[]): Promise<void> {
    await writeJsonFile(path.join(kbDir, "docs.json"), docs);
  }
}
