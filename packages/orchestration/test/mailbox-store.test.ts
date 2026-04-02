/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFilesystemOrchestrationStore } from "../src/orchestration-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createSessionDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "agent-orchestration-mailbox-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createStore(sessionDir: string) {
  return createFilesystemOrchestrationStore(sessionDir);
}

describe("mailbox store", () => {
  it("persists mailbox events and state per agent", async () => {
    const sessionDir = await createSessionDir();
    const store = createStore(sessionDir);

    await store.appendMailboxEvent("agent-mailbox", {
      eventId: "mailbox-evt-1",
      type: "input_enqueued",
      agentId: "agent-mailbox",
      occurredAt: "2026-03-23T12:00:00.000Z",
      inputId: "input-1",
      payload: {
        prompt: "Summarize the notes",
      },
    });
    await store.writeMailboxState("agent-mailbox", {
      processedEventCount: 1,
      closeRequested: null,
    });

    await expect(store.loadMailboxEvents("agent-mailbox")).resolves.toEqual([
      expect.objectContaining({
        eventId: "mailbox-evt-1",
        type: "input_enqueued",
        inputId: "input-1",
      }),
    ]);
    await expect(store.loadMailboxState("agent-mailbox")).resolves.toEqual({
      processedEventCount: 1,
      closeRequested: null,
    });
  });

  it("returns empty defaults for a missing mailbox", async () => {
    const sessionDir = await createSessionDir();
    const store = createStore(sessionDir);

    await expect(store.loadMailboxEvents("agent-missing")).resolves.toEqual([]);
    await expect(store.loadMailboxState("agent-missing")).resolves.toEqual({
      processedEventCount: 0,
      closeRequested: null,
    });
  });
});
