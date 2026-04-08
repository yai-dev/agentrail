/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { SkillConfig, SkillMeta } from "@/skills/types.js";

/**
 * Discovers and reads reusable skills stored beneath `{dataDir}/skills`.
 *
 * @see {@link https://agentrail.run/guides/use-capability-packages}
 */
export class SkillManager {
  private readonly skillsDir: string;
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.skillsDir = path.join(dataDir, "skills");
  }

  /** Returns the root directory that contains all installed skills. */
  getSkillsDir(): string {
    return this.skillsDir;
  }

  /** Returns the absolute directory path for a named skill. */
  getSkillDir(skillName: string): string {
    return path.join(this.skillsDir, skillName);
  }

  /**
   * Lists enabled skills.
   *
   * Discovery order for each skill directory:
   * 1. `skill.json` — full config manifest (authoritative when present).
   * 2. `SKILL.md` YAML frontmatter — compatible with the [agentskills.io](https://agentskills.io)
   *    standard; extracts `name` and `description` from the `---` block.
   *
   * When neither source is available the directory is silently skipped.
   * A skill whose `enabled` field is explicitly `false` is also skipped.
   */
  async listSkills(): Promise<SkillMeta[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();

      const results: SkillMeta[] = [];
      for (const dirName of dirs) {
        const skillDir = this.getSkillDir(dirName);
        const meta = await this.resolveSkillMeta(dirName, skillDir);
        if (meta) results.push(meta);
      }
      return results;
    } catch {
      // The skills directory may not exist yet on first run; treat as empty.
      return [];
    }
  }

  /** Resolves skill metadata from `skill.json` or `SKILL.md` frontmatter. */
  private async resolveSkillMeta(dirName: string, skillDir: string): Promise<SkillMeta | null> {
    // Prefer skill.json when present.
    const configPath = path.join(skillDir, "skill.json");
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(raw) as SkillConfig;
      if (config.enabled === false) return null;
      return {
        name: config.name ?? dirName,
        description: config.description ?? "",
        enabled: true,
        skillDir,
      };
    } catch {
      // Fall through to SKILL.md frontmatter
    }

    // Fallback: parse YAML frontmatter from SKILL.md
    const skillMdPath = path.join(skillDir, "SKILL.md");
    try {
      const raw = await fs.readFile(skillMdPath, "utf-8");
      const frontmatter = this.parseFrontmatter(raw);
      if (!frontmatter) return null;

      if (frontmatter.enabled === false) return null;

      const name = (frontmatter.name as string | undefined) ?? dirName;
      const description =
        (frontmatter.description as string | undefined) ??
        (frontmatter.tagline as string | undefined) ??
        "";

      // Validate that the declared name matches the directory name to prevent confusion.
      if (frontmatter.name && frontmatter.name !== dirName) {
        console.warn(
          `[SkillManager] Skill "${dirName}": SKILL.md declares name "${frontmatter.name}" ` +
          `but directory is "${dirName}". Using directory name.`,
        );
      }

      return {
        name,
        description,
        enabled: true,
        skillDir,
      };
    } catch {
      // No SKILL.md either — skip this directory.
      return null;
    }
  }

  /**
   * Parses YAML frontmatter from a Markdown string.
   * Returns the parsed key/value object, or null if no frontmatter block found.
   *
   * Intentionally minimal: only handles simple `key: value` pairs to avoid
   * pulling in a YAML parser as a dependency.
   */
  private parseFrontmatter(markdown: string): Record<string, unknown> | null {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
    if (!match) return null;
    const block = match[1]!;
    const result: Record<string, unknown> = {};
    for (const line of block.split(/\r?\n/)) {
      const colonIdx = line.indexOf(":");
      if (colonIdx < 1) continue;
      const key = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();
      // Booleans
      if (rawVal === "true") { result[key] = true; continue; }
      if (rawVal === "false") { result[key] = false; continue; }
      // Strip surrounding quotes
      result[key] = rawVal.replace(/^["']|["']$/g, "");
    }
    return result;
  }

  /** Reads the `SKILL.md` body for a named skill. */
  async readSkill(skillName: string): Promise<string> {
    const safe = this.resolveSkillNameSafe(skillName);
    const skillMdPath = path.join(safe, "SKILL.md");
    try {
      return await fs.readFile(skillMdPath, "utf-8");
    } catch {
      throw new Error(`Skill "${skillName}" not found or SKILL.md is missing`);
    }
  }

  /** Validate that skillName doesn't escape the skills directory. */
  private resolveSkillNameSafe(skillName: string): string {
    const skillDir = path.resolve(this.skillsDir, skillName);
    if (
      !skillDir.startsWith(path.resolve(this.skillsDir) + path.sep) &&
      skillDir !== path.resolve(this.skillsDir)
    ) {
      throw new Error(`Invalid skill name: "${skillName}"`);
    }
    return skillDir;
  }
}
