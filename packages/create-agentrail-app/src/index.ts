#!/usr/bin/env node

/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { intro, outro, text, confirm, spinner, note, cancel } from "@clack/prompts";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENTRAIL_PACKAGES = [
  "@agentrail/runtime-core",
  "@agentrail/host",
  "@agentrail/memo",
  "@agentrail/sandbox",
] as const;

const THIRD_PARTY_PACKAGES = ["hono", "@hono/node-server"] as const;

const ALL_PACKAGES = [...AGENTRAIL_PACKAGES, ...THIRD_PARTY_PACKAGES];

async function resolveLatestVersion(pkg: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`,
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!res.ok) return "latest";
    const data = (await res.json()) as { version: string };
    return `^${data.version}`;
  } catch {
    return "latest";
  }
}

async function processFile(
  filePath: string,
  replacements: Record<string, string>,
): Promise<void> {
  const content = await readFile(filePath, "utf-8");
  const updated = Object.entries(replacements).reduce(
    (acc, [key, val]) => acc.replaceAll(`{{${key}}}`, val),
    content,
  );
  await writeFile(filePath, updated, "utf-8");
}

function toPlaceholderKey(pkg: string): string {
  return pkg
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_")
    .toUpperCase();
}

async function main(): Promise<void> {
  intro("create-agentrail-app");

  // --- Determine project name ---
  const nameArg = process.argv[2]?.trim();
  let projectName: string;

  if (nameArg && nameArg.length > 0) {
    projectName = nameArg;
  } else {
    const result = await text({
      message: "Project name:",
      placeholder: "my-agentrail-app",
      validate: (v) =>
        v.trim().length === 0 ? "Project name cannot be empty" : undefined,
    });
    if (typeof result !== "string") {
      cancel("Operation cancelled");
      process.exit(0);
    }
    projectName = result.trim();
  }

  const targetDir = join(process.cwd(), projectName);

  // --- Handle existing directory ---
  if (existsSync(targetDir)) {
    const overwrite = await confirm({
      message: `Directory "${projectName}" already exists. Overwrite?`,
    });
    if (!overwrite) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    await rm(targetDir, { recursive: true, force: true });
  }

  // --- Resolve latest versions ---
  const s = spinner();
  s.start("Resolving latest package versions…");

  const versions = await Promise.all(
    ALL_PACKAGES.map(async (pkg) => {
      const version = await resolveLatestVersion(pkg);
      return [pkg, version] as const;
    }),
  );
  const versionMap = Object.fromEntries(versions);

  s.stop("Package versions resolved");

  // --- Copy template ---
  s.start("Scaffolding project…");

  const templateDir = join(__dirname, "..", "templates", "minimal");
  await mkdir(targetDir, { recursive: true });
  await cp(templateDir, targetDir, { recursive: true });

  // Rename gitignore -> .gitignore (npm strips dotfiles during publish)
  const gitignoreSrc = join(targetDir, "gitignore");
  if (existsSync(gitignoreSrc)) {
    await rename(gitignoreSrc, join(targetDir, ".gitignore"));
  }

  // Build replacement map
  const replacements: Record<string, string> = { PROJECT_NAME: projectName };
  for (const pkg of ALL_PACKAGES) {
    replacements[`VERSION_${toPlaceholderKey(pkg)}`] = versionMap[pkg];
  }

  // Process package.json.template -> package.json
  const pkgTemplatePath = join(targetDir, "package.json.template");
  await processFile(pkgTemplatePath, replacements);
  await rename(pkgTemplatePath, join(targetDir, "package.json"));

  // Replace placeholders in src/ files
  const { readdir } = await import("node:fs/promises");
  const srcFiles = await readdir(join(targetDir, "src"));
  for (const file of srcFiles) {
    await processFile(join(targetDir, "src", file), replacements);
  }

  s.stop("Project scaffolded");

  note(
    [
      `  cd ${projectName}`,
      "  pnpm install",
      "  cp .env.example .env   # add your LLM API key",
      "  pnpm dev",
    ].join("\n"),
    "Next steps",
  );

  outro(`Your Agentrail app "${projectName}" is ready!`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
