/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { readFileSync, statSync } from "node:fs";

export type PromptValue = string | number | boolean | null | undefined;
export type PromptVars = Record<string, PromptValue>;
export type PromptLayerName = "base" | "capability" | "profile" | "mode";

export interface PromptFragment {
  key: string;
  content?: string;
  filePath?: string;
  stripMetadata?: boolean;
}

export interface PromptLayer {
  fragments?: PromptFragment[];
  replace?: Record<string, PromptFragment>;
  vars?: PromptVars;
}

export interface PromptBundle {
  vars?: PromptVars;
  base?: PromptLayer;
  capability?: PromptLayer;
  profile?: PromptLayer;
  mode?: PromptLayer;
}

export interface LoadPromptFileOptions {
  stripMetadata?: boolean;
  vars?: PromptVars;
}

export interface PromptRenderOptions {
  vars?: PromptVars;
  overlay?: PromptBundle;
  bundle?: PromptBundle;
}

export interface PromptBuilder {
  render(options?: PromptRenderOptions): string;
  clearCache(): void;
}

interface CachedPromptFile {
  mtimeMs: number;
  raw: string;
}

const LAYER_ORDER: PromptLayerName[] = [
  "base",
  "capability",
  "profile",
  "mode",
];

/**
 * A per-instance prompt file loader with its own mtime-based cache.
 * Using an instance rather than a module-level map prevents cache state
 * from bleeding between test runs and between independent PromptBuilder
 * instances.
 */
export class PromptLoader {
  private cache = new Map<string, CachedPromptFile>();

  loadFile(filePath: string, options: LoadPromptFileOptions = {}): string {
    const { stripMetadata = true, vars = {} } = options;
    const stats = statSync(filePath);
    const cached = this.cache.get(filePath);

    let raw: string;
    if (cached && cached.mtimeMs === stats.mtimeMs) {
      raw = cached.raw;
    } else {
      raw = readFileSync(filePath, "utf8");
      this.cache.set(filePath, { mtimeMs: stats.mtimeMs, raw });
    }

    const normalized = stripMetadata ? stripPromptMetadata(raw) : raw.trim();
    return renderPrompt(normalized, vars);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Module-level loader kept for backward compatibility with loadPromptFile().
const moduleLoader = new PromptLoader();

export function definePromptFragment<T extends PromptFragment>(fragment: T): T {
  return fragment;
}

export function definePromptBundle<T extends PromptBundle>(bundle: T): T {
  return bundle;
}

/** @deprecated Use a PromptLoader instance or createPromptBuilder instead. */
export function clearPromptFileCache(): void {
  moduleLoader.clearCache();
}

export function stripPromptMetadata(content: string): string {
  return content.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
}

export function renderPrompt(
  content: string,
  vars: PromptVars = {},
): string {
  return content.replace(/\$\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      return match;
    }

    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

/** @deprecated Use a PromptLoader instance for isolated caching. */
export function loadPromptFile(
  filePath: string,
  options: LoadPromptFileOptions = {},
): string {
  return moduleLoader.loadFile(filePath, options);
}

export function createPromptBuilder(bundle: PromptBundle): PromptBuilder {
  const loader = new PromptLoader();
  return {
    render(options: PromptRenderOptions = {}): string {
      const source =
        options.bundle ??
        (options.overlay ? mergePromptBundles(bundle, options.overlay) : bundle);
      return renderPromptBundle(source, options.vars, loader);
    },
    clearCache() {
      loader.clearCache();
    },
  };
}

function renderPromptBundle(
  bundle: PromptBundle,
  vars: PromptVars = {},
  loader: PromptLoader = moduleLoader,
): string {
  const mergedVars = {
    ...(bundle.vars ?? {}),
    ...vars,
  };
  const fragments: string[] = [];

  for (const layerName of LAYER_ORDER) {
    const layer = bundle[layerName];
    if (!layer) {
      continue;
    }

    const layerVars = {
      ...mergedVars,
      ...(layer.vars ?? {}),
    };
    for (const fragment of materializeLayer(layer)) {
      fragments.push(renderPromptFragment(fragment, layerVars, loader));
    }
  }

  return fragments
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)
    .join("\n\n");
}

function renderPromptFragment(fragment: PromptFragment, vars: PromptVars, loader: PromptLoader = moduleLoader): string {
  if (fragment.filePath) {
    return loader.loadFile(fragment.filePath, {
      stripMetadata: fragment.stripMetadata,
      vars,
    });
  }

  return renderPrompt((fragment.content ?? "").trim(), vars).trim();
}

function materializeLayer(layer: PromptLayer): PromptFragment[] {
  const fragments = [...(layer.fragments ?? [])];
  const replacements = new Map(Object.entries(layer.replace ?? {}));
  const resolved: PromptFragment[] = [];

  for (const fragment of fragments) {
    const replacement = replacements.get(fragment.key);
    if (replacement) {
      resolved.push(replacement);
      replacements.delete(fragment.key);
    } else {
      resolved.push(fragment);
    }
  }

  for (const replacement of replacements.values()) {
    resolved.push(replacement);
  }

  return resolved;
}

function mergePromptBundles(
  base: PromptBundle,
  overlay: PromptBundle,
): PromptBundle {
  const merged: PromptBundle = {
    vars: {
      ...(base.vars ?? {}),
      ...(overlay.vars ?? {}),
    },
  };

  for (const layerName of LAYER_ORDER) {
    const baseLayer = base[layerName];
    const overlayLayer = overlay[layerName];

    if (!baseLayer && !overlayLayer) {
      continue;
    }

    merged[layerName] = {
      fragments: [
        ...(baseLayer?.fragments ?? []),
        ...(overlayLayer?.fragments ?? []),
      ],
      replace: {
        ...(baseLayer?.replace ?? {}),
        ...(overlayLayer?.replace ?? {}),
      },
      vars: {
        ...(baseLayer?.vars ?? {}),
        ...(overlayLayer?.vars ?? {}),
      },
    };
  }

  return merged;
}
