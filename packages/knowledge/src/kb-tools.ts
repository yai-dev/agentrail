/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tool, Type } from "@agentrail/runtime-core";
import type { KnowledgeManager } from "./knowledge-manager.js";

const execAsync = promisify(exec);

const DEFAULT_READ_LINES = 200;
const MAX_LINE_LENGTH = 1000;

/**
 * Validate that kbDir belongs to the expected tenant's knowledge_bases directory.
 * Returns the resolved absolute path, or throws on invalid input.
 */
function validateKbDir(
  knowledgeManager: KnowledgeManager,
  tenantId: string,
  kbDir: string
): string {
  // Derive the parent directory shared by all KBs for this tenant
  const parentDir = path.dirname(knowledgeManager.getKbDir(tenantId, "_"));
  const resolved = path.resolve(kbDir);
  const relative = path.relative(parentDir, resolved);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.includes(path.sep)
  ) {
    throw new Error(
      `Invalid kbDir: "${kbDir}" is not a valid knowledge base directory for this tenant`
    );
  }
  return resolved;
}

/**
 * Resolve a relative path against kbDir and verify it stays within kbDir.
 * Throws if path traversal is detected.
 */
function resolveSafe(kbDir: string, relativePath: string): string {
  const resolved = path.resolve(kbDir, relativePath);
  const base = path.resolve(kbDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(
      `Path traversal detected: "${relativePath}" is outside the knowledge base directory`
    );
  }
  return resolved;
}

/**
 * Create a KbList tool scoped to the given tenant.
 * Returns all available knowledge bases with their kbDir and metadata summaries.
 * Use the kbDir from the result as input to KbRead and KbSearch.
 */
export function createKbListTool(knowledgeManager: KnowledgeManager, tenantId: string) {
  return tool()
    .name("KbList")
    .label("KbList")
    .description(
      "List all knowledge bases available for the current tenant. " +
        "Returns each KB's kbDir (absolute path), name, document count, topics, and recent documents. " +
        "Always call this first to discover available knowledge bases before using KbRead or KbSearch."
    )
    .parameters(Type.Object({}))
    .execute(async () => {
      const kbIds = await knowledgeManager.listKbs(tenantId);
      if (kbIds.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No knowledge bases found." }],
          details: { knowledgeBases: [] },
        };
      }

      const metas = await Promise.all(
        kbIds.map((id) => knowledgeManager.getMetadata(tenantId, id))
      );

      const lines: string[] = [];
      const knowledgeBases: unknown[] = [];

      for (const meta of metas) {
        if (!meta) continue;
        lines.push(`KB: ${meta.name}`);
        lines.push(`  kbDir: ${meta.kbDir}`);
        lines.push(`  Documents: ${meta.documentCount}`);
        if (meta.description) lines.push(`  Description: ${meta.description}`);
        if (meta.topics.length > 0) {
          const topicStr = meta.topics
            .map((t) => `${t.topic}(${t.docCount} doc${t.docCount !== 1 ? "s" : ""}${t.hasIndex ? ", indexed" : ""})`)
            .join(", ");
          lines.push(`  Topics: ${topicStr}`);
        }
        if (meta.recentDocs.length > 0) {
          lines.push("  Recent documents:");
          for (const doc of meta.recentDocs.slice(0, 5)) {
            const summary = doc.summary ? ` — ${doc.summary}` : "";
            lines.push(`    - "${doc.title}"${summary}`);
          }
        }
        lines.push("");
        knowledgeBases.push(meta);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n").trim() }],
        details: { knowledgeBases },
      };
    })
    .build();
}

/**
 * Create a KbRead tool scoped to the given tenant.
 * The agent must supply kbDir (obtained from KbList) as a parameter.
 * Paths are relative to kbDir; path traversal outside kbDir is rejected.
 */
export function createKbReadTool(knowledgeManager: KnowledgeManager, tenantId: string) {
  return tool()
    .name("KbRead")
    .label("KbRead")
    .description(
      `Read a file from a knowledge base. Use KbList first to obtain a valid kbDir.

Usage:
- kbDir: absolute path to the knowledge base root (from KbList)
- path: file path relative to kbDir, e.g. "indexes/rag_index.md" or "docs/AI/RAG/{docId}.md"
- offset: starting line number (1-indexed); negative values count from the end
- limit: maximum number of lines to read (default ${DEFAULT_READ_LINES})
- Cannot access files outside the knowledge base directory`
    )
    .parameters(
      Type.Object({
        kbDir: Type.String({
          description:
            "Absolute path to the knowledge base directory. Obtain via KbList.",
        }),
        path: Type.String({
          description:
            'File path relative to kbDir, e.g. "indexes/rag_index.md" or "docs/AI/RAG/architecture/{docId}.md".',
        }),
        offset: Type.Optional(
          Type.Integer({
            description:
              "Starting line number (1-indexed). Negative values count from the end of the file.",
          })
        ),
        limit: Type.Optional(
          Type.Integer({
            description: `Maximum number of lines to read. Defaults to ${DEFAULT_READ_LINES}.`,
            minimum: 1,
          })
        ),
      })
    )
    .execute(async ({ kbDir: rawKbDir, path: relPath, offset, limit }) => {
      let kbDirResolved: string;
      try {
        kbDirResolved = validateKbDir(knowledgeManager, tenantId, rawKbDir);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { error: message },
        };
      }

      let absolutePath: string;
      try {
        absolutePath = resolveSafe(kbDirResolved, relPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { error: message },
        };
      }

      let raw: string;
      try {
        raw = await fs.readFile(absolutePath, "utf-8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error reading file: ${message}` }],
          details: { error: message },
        };
      }

      if (raw === "") {
        return {
          content: [
            {
              type: "text" as const,
              text: "<system-reminder>File exists but has empty contents.</system-reminder>",
            },
          ],
          details: { totalLines: 0, lines: [] },
        };
      }

      const allLines = raw.split("\n");
      const totalLines = allLines.length;
      const maxLines = limit ?? DEFAULT_READ_LINES;

      let startIndex: number;
      if (offset === undefined || offset === null) {
        startIndex = 0;
      } else if (offset < 0) {
        startIndex = Math.max(0, totalLines + offset);
      } else {
        startIndex = Math.max(0, offset - 1);
      }

      const selectedLines = allLines.slice(startIndex, startIndex + maxLines);
      const formattedLines = selectedLines.map((line, i) => {
        const lineNum = startIndex + i + 1;
        const truncated =
          line.length > MAX_LINE_LENGTH
            ? line.slice(0, MAX_LINE_LENGTH) + " [truncated]"
            : line;
        return `${String(lineNum).padStart(6)}|${truncated}`;
      });

      return {
        content: [{ type: "text" as const, text: formattedLines.join("\n") }],
        details: {
          totalLines,
          startLine: startIndex + 1,
          endLine: startIndex + selectedLines.length,
          lines: selectedLines,
        },
      };
    })
    .build();
}

/**
 * Create a KbSearch tool scoped to the given tenant.
 * The agent must supply kbDir (obtained from KbList) as a parameter.
 * Uses ripgrep to full-text search within the knowledge base.
 */
export function createKbSearchTool(knowledgeManager: KnowledgeManager, tenantId: string) {
  return tool()
    .name("KbSearch")
    .label("KbSearch")
    .description(
      "Full-text search within a knowledge base using ripgrep. " +
        "Use KbList first to obtain a valid kbDir. " +
        'Searches docs/ by default; use subdir to target other subdirectories (e.g. "indexes").\n\n' +
        "Usage:\n" +
        "- kbDir: absolute path to the knowledge base root (from KbList)\n" +
        "- pattern: regex or plain keyword\n" +
        '- subdir: subdirectory relative to kbDir (default: "docs")\n' +
        '- output_mode: "content" shows matching lines; "files" shows only file paths (default: "content")'
    )
    .parameters(
      Type.Object({
        kbDir: Type.String({
          description:
            "Absolute path to the knowledge base directory. Obtain via KbList.",
        }),
        pattern: Type.String({
          description: "Regular expression or keyword to search for.",
        }),
        subdir: Type.Optional(
          Type.String({
            description:
              'Subdirectory to search within, relative to kbDir. Defaults to "docs".',
          })
        ),
        output_mode: Type.Optional(
          Type.Union(
            [Type.Literal("content"), Type.Literal("files")],
            {
              description:
                '"content" shows matching lines, "files" shows only file paths. Defaults to "content".',
              default: "content",
            }
          )
        ),
        case_insensitive: Type.Optional(
          Type.Boolean({
            description: "Case-insensitive search. Defaults to false.",
            default: false,
          })
        ),
      })
    )
    .execute(async ({ kbDir: rawKbDir, pattern, subdir, output_mode, case_insensitive }) => {
      let kbDirResolved: string;
      try {
        kbDirResolved = validateKbDir(knowledgeManager, tenantId, rawKbDir);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { error: message },
        };
      }

      const targetSubdir = subdir ?? "docs";
      let searchPath: string;
      try {
        searchPath = resolveSafe(kbDirResolved, targetSubdir);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { error: message },
        };
      }

      const mode = output_mode ?? "content";
      const args: string[] = ["rg"];
      if (mode === "files") args.push("-l");
      if (case_insensitive) args.push("-i");

      const safePattern = pattern.replace(/'/g, "'\\''");
      const safeSearchPath = searchPath.replace(/'/g, "'\\''");
      const cmd = `${args.join(" ")} -- '${safePattern}' '${safeSearchPath}'`;

      try {
        const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
        const text = stdout.trim() || "(no matches)";
        return {
          content: [{ type: "text" as const, text }],
          details: { matches: stdout.trim().split("\n").filter(Boolean) },
        };
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as NodeJS.ErrnoException).code === "1"
        ) {
          return {
            content: [{ type: "text" as const, text: "(no matches)" }],
            details: { matches: [] },
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Search failed: ${message}` }],
          details: { error: message },
        };
      }
    })
    .build();
}
