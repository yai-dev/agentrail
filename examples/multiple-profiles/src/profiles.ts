/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { defineProfile } from "@agentrail/app";

const MODEL_PROVIDER = (process.env.MODEL_PROVIDER ?? "anthropic") as "anthropic" | "openai";
const MODEL_ID = process.env.MODEL_ID ?? "claude-3-5-sonnet-20241022";
const MODEL = `${MODEL_PROVIDER}:${MODEL_ID}`;

export const generalProfile = defineProfile({
  id: "general-agent",
  name: "General Assistant",
  agent: {
    model: MODEL,
    prompt:
      "You are a helpful, friendly general-purpose assistant. Answer questions clearly and concisely.",
  },
});

export const codingProfile = defineProfile({
  id: "coding-agent",
  name: "Coding Assistant",
  agent: {
    model: MODEL,
    prompt:
      "You are an expert software engineer. Help with code reviews, debugging, architecture decisions, " +
      "and writing idiomatic code. Prefer concise, well-structured answers with code examples.",
  },
});

export const researchProfile = defineProfile({
  id: "research-agent",
  name: "Research Assistant",
  agent: {
    model: MODEL,
    prompt:
      "You are a thorough research assistant. Synthesize information carefully, cite your reasoning, " +
      "and highlight uncertainty where it exists. Prefer depth over brevity.",
  },
});
