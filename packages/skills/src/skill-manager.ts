/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { SkillMeta, SkillConfig } from "./types.js";

export class SkillManager {
  private readonly skillsDir: string;
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.skillsDir = path.join(dataDir, "skills");
  }

  getSkillsDir(): string {
    return this.skillsDir;
  }

  getSkillDir(skillName: string): string {
    return path.join(this.skillsDir, skillName);
  }

  async listSkills(): Promise<SkillMeta[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

      const results: SkillMeta[] = [];
      for (const name of dirs) {
        const skillDir = this.getSkillDir(name);
        const configPath = path.join(skillDir, "skill.json");
        try {
          const raw = await fs.readFile(configPath, "utf-8");
          const config = JSON.parse(raw) as SkillConfig;
          // Treat absent `enabled` as true so skills are opt-out rather than opt-in.
          if (config.enabled !== false) {
            results.push({
              name,
              description: config.description ?? "",
              enabled: true,
              skillDir,
            });
          }
        } catch {
          // Skip skill directories without a valid skill.json
        }
      }
      return results;
    } catch {
      // The skills directory may not exist yet on first run; treat as empty.
      return [];
    }
  }

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
