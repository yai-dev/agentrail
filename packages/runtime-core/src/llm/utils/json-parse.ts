/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export function parseStreamingJson<T = unknown>(partialJson: string | undefined): T {
  if (!partialJson || partialJson.trim() === "") {
    return {} as unknown as T;
  }

  try {
    return JSON.parse(partialJson) as unknown as T;
  } catch {
    try {
      return parsePartialJson(partialJson) as unknown as T;
    } catch {
      return {} as unknown as T;
    }
  }
}

function parsePartialJson(text: string): unknown {
  text = text.trim();

  if (!text) return {};

  if (text.startsWith("{")) {
    return parsePartialObject(text);
  }

  if (text.startsWith("[")) {
    return parsePartialArray(text);
  }

  return JSON.parse(text);
}

function parsePartialObject(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (text.endsWith("}")) {
    try {
      return JSON.parse(text);
    } catch {}
  }

  let depth = 0;
  let currentKey = "";
  let currentValue = "";
  let inString = false;
  let inKey = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      if (inKey) currentKey += char;
      else if (depth === 1) currentValue += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        depth++;
        if (depth === 1) continue;
      }
      if (char === "}") {
        depth--;
        if (depth === 0) {
          if (currentKey && currentValue) {
            result[currentKey.trim()] = parseValue(currentValue.trim());
          }
          break;
        }
      }
      if (depth === 1) {
        if (char === ":") {
          inKey = false;
          continue;
        }
        if (char === ",") {
          if (currentKey && currentValue) {
            result[currentKey.trim()] = parseValue(currentValue.trim());
          }
          currentKey = "";
          currentValue = "";
          inKey = true;
          continue;
        }
      }
    }

    if (depth === 1) {
      if (inKey) {
        currentKey += char;
      } else if (currentKey) {
        currentValue += char;
      } else if (char !== "{" && char !== "}" && !/\s/.test(char)) {
        inKey = true;
        currentKey = char;
      }
    }
  }

  if (currentKey && currentValue) {
    try {
      result[currentKey.trim()] = parseValue(currentValue.trim());
    } catch {}
  }

  return result;
}

function parsePartialArray(text: string): unknown[] {
  if (text.endsWith("]")) {
    try {
      return JSON.parse(text);
    } catch {}
  }

  return [];
}

function parseValue(value: string): unknown {
  if (!value) return "";

  if (value === "true") return true;
  if (value === "false") return false;

  // null
  if (value === "null") return null;

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  if (value.startsWith("{")) {
    try {
      return parsePartialObject(value);
    } catch {
      return value;
    }
  }

  if (value.startsWith("[")) {
    try {
      return parsePartialArray(value);
    } catch {
      return value;
    }
  }

  return value;
}
