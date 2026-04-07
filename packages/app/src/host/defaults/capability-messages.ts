/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { KBMetadata } from "@agentrail/capabilities";
import type { MemoryIndex, MemoryIndexEntry } from "@agentrail/core";
import type { UserMessage } from "@agentrail/core";
import type { SkillMeta } from "@agentrail/capabilities";

/** Creates a user-scoped identity hint message for default hosted profiles. */
export function makeUserIdentityMessage(
  tenantId: string,
  userId: string,
  timestamp = Date.now(),
): UserMessage {
  return {
    role: "user",
    content: `[User Identity]\ntenant_id: ${tenantId}\nuser_id: ${userId}`,
    timestamp,
  };
}

/** Creates a synthetic message that tells the agent the current wall-clock date. */
export function makeDateContextMessage(timestamp = Date.now()): UserMessage {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    role: "user",
    content: `[Context] Today is ${date}.`,
    timestamp,
  };
}

/** Rewrites local memory paths into sandbox-visible paths for model context. */
export function translateMemoryPaths(index: MemoryIndex): MemoryIndex {
  const translatePath = (filePath: string): string => {
    if (filePath.startsWith(index.sessionDir)) {
      return "/workspace/memo/session" + filePath.slice(index.sessionDir.length);
    }
    if (filePath.startsWith(index.userDir)) {
      return "/workspace/memo/user" + filePath.slice(index.userDir.length);
    }
    return filePath;
  };

  return {
    sessionDir: "/workspace/memo/session",
    userDir: "/workspace/memo/user",
    entries: index.entries.map((entry: MemoryIndexEntry) => ({
      ...entry,
      path: translatePath(entry.path),
    })),
  };
}

/** Creates a synthetic message that summarizes session and user memory files. */
export function makeMemoryIndexMessage(index: MemoryIndex, timestamp = Date.now()): UserMessage {
  const lines: string[] = [
    "[Memory Index]",
    `Session dir : ${index.sessionDir}`,
    `User dir    : ${index.userDir}`,
    "",
  ];

  for (const entry of index.entries) {
    if (!entry.exists) {
      lines.push(`- ${entry.name}  (not created yet)`);
      continue;
    }

    const age = entry.updatedAt
      ? `updated ${Math.round((Date.now() - entry.updatedAt) / 60000)} min ago`
      : "unknown age";
    const size = `~${entry.sizeTokensApprox} tokens`;
    const summary = entry.summary ? `"${entry.summary}"` : "(no summary)";
    lines.push(`- ${entry.name.padEnd(10)} (${size}, ${age}) ${summary}`);
  }

  lines.push("", "Use the `read` tool with the full path to load any file when relevant.");

  return {
    role: "user",
    content: lines.join("\n"),
    timestamp,
  };
}

/** Creates a synthetic message that summarizes available knowledge bases. */
export function makeKnowledgeContextMessage(
  metas: (KBMetadata | null)[],
  timestamp = Date.now(),
): UserMessage | null {
  const valid = metas.filter((meta): meta is KBMetadata => meta !== null);
  if (valid.length === 0) {
    return null;
  }

  const lines: string[] = ["[Knowledge Base Index]", ""];

  for (const meta of valid) {
    lines.push(
      `KB: ${meta.name} (${meta.documentCount} document${meta.documentCount !== 1 ? "s" : ""})`,
    );
    lines.push(`Path: ${meta.kbDir}`);

    if (meta.topics.length > 0) {
      const topicStr = meta.topics
        .map(
          (topic) =>
            `${topic.topic} (${topic.docCount} doc${topic.docCount !== 1 ? "s" : ""}${
              topic.hasIndex ? ", has index" : ""
            })`,
        )
        .join(", ");
      lines.push(`Topics: ${topicStr}`);
    }

    if (meta.recentDocs.length > 0) {
      lines.push("Recent documents:");
      for (const doc of meta.recentDocs) {
        const summary = doc.summary ? ` — "${doc.summary}"` : "";
        lines.push(`  - "${doc.title}"${summary}`);
      }
    }

    lines.push("");
  }

  lines.push(
    "To access knowledge base content, always follow this sequence:",
    "  1. KbList()                                    — confirm available KBs and obtain kbDir",
    '  2. KbRead(kbDir, "indexes/{topic}_index.md")   — topic-level document lists',
    '     KbRead(kbDir, "docs/{category}/{docId}.md") — full document content',
    "     KbSearch(kbDir, pattern)                    — full-text search within docs/",
    "Never call KbRead or KbSearch without first calling KbList to obtain a confirmed kbDir.",
  );

  return {
    role: "user",
    content: lines.join("\n"),
    timestamp,
  };
}

/** Creates a synthetic message that lists available reusable skills. */
export function makeSkillsContextMessage(
  skills: SkillMeta[],
  delegateToSubAgent: boolean,
  timestamp = Date.now(),
): UserMessage | null {
  if (skills.length === 0) {
    return null;
  }

  const lines: string[] = ["[Skills Index]", ""];
  for (const skill of skills) {
    lines.push(`- ${skill.name}: ${skill.description}`);
  }

  const hint = delegateToSubAgent
    ? "Use the Skill tool to invoke any of the above. Pass the specific task and relevant context."
    : "Use the Skill tool to load instructions for any of the above, then execute them yourself step by step using your own tools.";

  lines.push("", hint);

  return {
    role: "user",
    content: lines.join("\n"),
    timestamp,
  };
}
