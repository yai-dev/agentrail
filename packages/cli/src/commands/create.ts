/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { cancel, confirm, intro, note, outro, spinner, text } from "@clack/prompts";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENTRAIL_PACKAGES = ["@agentrail/core", "@agentrail/app"] as const;
const THIRD_PARTY_PACKAGES = ["hono", "@hono/node-server"] as const;
const ALL_PACKAGES = [...AGENTRAIL_PACKAGES, ...THIRD_PARTY_PACKAGES];

async function resolveLatestVersion(pkg: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return "latest";
    const data = (await res.json()) as { version: string };
    return `^${data.version}`;
  } catch {
    return "latest";
  }
}

async function processFile(filePath: string, replacements: Record<string, string>): Promise<void> {
  const content = await readFile(filePath, "utf-8");
  const updated = Object.entries(replacements).reduce(
    (acc, [key, val]) => acc.replaceAll(`{{${key}}}`, val),
    content,
  );
  await writeFile(filePath, updated, "utf-8");
}

function toPlaceholderKey(pkg: string): string {
  return pkg.replace(/^@/, "").replace(/\//g, "_").replace(/-/g, "_").toUpperCase();
}

/**
 * Entry point for `agentrail create [name]`.
 * Scaffolds a new Agentrail project from the minimal template.
 */
export async function runCreate(args: string[]): Promise<void> {
  intro("agentrail create");

  const nameArg = args[0]?.trim();
  let projectName: string;

  if (nameArg && nameArg.length > 0) {
    projectName = nameArg;
  } else {
    const result = await text({
      message: "Project name:",
      placeholder: "my-agentrail-app",
      validate: (v) => (v.trim().length === 0 ? "Project name cannot be empty" : undefined),
    });
    if (typeof result !== "string") {
      cancel("Operation cancelled");
      process.exit(0);
    }
    projectName = result.trim();
  }

  const targetDir = join(process.cwd(), projectName);

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

  const s = spinner();
  s.start("Resolving latest package versions…");
  const versions = await Promise.all(
    ALL_PACKAGES.map(async (pkg) => [pkg, await resolveLatestVersion(pkg)] as const),
  );
  const versionMap = Object.fromEntries(versions);
  s.stop("Package versions resolved");

  s.start("Scaffolding project…");
  // Templates are co-located with the compiled dist — walk up from dist/ to find them
  const templateDir = join(__dirname, "..", "templates", "minimal");
  await mkdir(targetDir, { recursive: true });
  await cp(templateDir, targetDir, { recursive: true });

  const gitignoreSrc = join(targetDir, "gitignore");
  if (existsSync(gitignoreSrc)) {
    await rename(gitignoreSrc, join(targetDir, ".gitignore"));
  }

  const replacements: Record<string, string> = { PROJECT_NAME: projectName };
  for (const pkg of ALL_PACKAGES) {
    replacements[`VERSION_${toPlaceholderKey(pkg)}`] = versionMap[pkg];
  }

  const pkgTemplatePath = join(targetDir, "package.json.template");
  await processFile(pkgTemplatePath, replacements);
  await rename(pkgTemplatePath, join(targetDir, "package.json"));

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
