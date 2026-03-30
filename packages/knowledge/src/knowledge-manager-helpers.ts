/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { KBMetadata, KBDocMeta, Taxonomy } from "./types.js";

export async function ensureJsonFile<T>(
  filePath: string,
  defaultValue: T,
): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
  }
}

export async function readJsonFileOrDefault<T>(
  filePath: string,
  defaultValue: T,
): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export async function listIndexTopics(kbDir: string): Promise<Set<string>> {
  let indexFiles: string[] = [];
  try {
    indexFiles = await fs.readdir(path.join(kbDir, "indexes"));
  } catch {
    // The indexes directory may not exist for a newly created knowledge base.
  }

  return new Set(
    indexFiles
      .filter((file) => file.endsWith("_index.md"))
      .map((file) => file.replace(/_index\.md$/, "")),
  );
}

export function countReadyDocsByTopic(
  docs: KBDocMeta[],
): Map<string, number> {
  const topicDocMap = new Map<string, number>();
  for (const doc of docs) {
    if (doc.status !== "ready") {
      continue;
    }

    for (const topic of doc.topics) {
      topicDocMap.set(topic, (topicDocMap.get(topic) ?? 0) + 1);
    }
  }

  return topicDocMap;
}

export function buildTopicSummaries(
  docs: KBDocMeta[],
  indexTopics: Set<string>,
): KBMetadata["topics"] {
  const topicDocMap = countReadyDocsByTopic(docs);
  return Array.from(new Set([...topicDocMap.keys(), ...indexTopics])).map(
    (topic) => ({
      topic,
      hasIndex: indexTopics.has(topic),
      docCount: topicDocMap.get(topic) ?? 0,
    }),
  );
}

export function buildRecentDocs(
  docs: KBDocMeta[],
): KBMetadata["recentDocs"] {
  return docs
    .filter((doc) => doc.status === "ready")
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 10)
    .map((doc) => ({
      docId: doc.docId,
      title: doc.title,
      summary: doc.summary,
      category: doc.category,
      updatedAt: doc.updatedAt,
    }));
}

export async function removeDocumentReferencesFromIndexes(
  indexDir: string,
  docId: string,
): Promise<void> {
  let indexFiles: string[] = [];
  try {
    indexFiles = await fs.readdir(indexDir);
  } catch {
    return;
  }

  for (const file of indexFiles) {
    if (!file.endsWith(".md")) {
      continue;
    }

    const indexPath = path.join(indexDir, file);
    const content = await fs.readFile(indexPath, "utf-8");
    const filtered = content
      .split("\n")
      .filter((line) => !line.includes(docId))
      .join("\n");

    if (filtered !== content) {
      await fs.writeFile(indexPath, filtered, "utf-8");
    }
  }
}

export async function replaceIndexDocumentPaths(
  indexesDir: string,
  kbDir: string,
  oldRelPath: string,
  newRelPath: string,
): Promise<void> {
  let files: string[] = [];
  try {
    files = await fs.readdir(indexesDir);
  } catch {
    return;
  }

  const variants = [
    oldRelPath,
    `../${oldRelPath}`,
    path.join(kbDir, oldRelPath).replace(/\\/g, "/"),
  ];

  for (const file of files) {
    if (!file.endsWith(".md")) {
      continue;
    }

    const indexPath = path.join(indexesDir, file);
    let content = await fs.readFile(indexPath, "utf-8");
    let changed = false;

    for (const variant of variants) {
      if (!content.includes(variant)) {
        continue;
      }

      content = content.split(variant).join(`../${newRelPath}`);
      changed = true;
    }

    if (changed) {
      await fs.writeFile(indexPath, content, "utf-8");
    }
  }
}

export async function buildKnowledgeMetadata(input: {
  kbId: string;
  kbDir: string;
  docs: KBDocMeta[];
  taxonomy: Taxonomy;
}): Promise<KBMetadata> {
  const { kbId, kbDir, docs, taxonomy } = input;
  const indexTopics = await listIndexTopics(kbDir);
  const readyDocs = docs
    .filter((doc) => doc.status === "ready")
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return {
    kbId,
    name: kbId,
    description: "",
    kbDir,
    documentCount: readyDocs.length,
    taxonomy,
    topics: buildTopicSummaries(docs, indexTopics),
    recentDocs: buildRecentDocs(docs),
    updatedAt: Date.now(),
  };
}
