/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

/**
 * Awaits a sandbox warmup promise that was started fire-and-forget earlier in
 * the request lifecycle. Returns `true` when the sandbox is ready.
 *
 * On failure writes an SSE error event and returns `false`, signalling the
 * caller to abort the stream without further processing.
 */
export async function awaitSandboxWarmup(
  sandboxReady: Promise<unknown> | undefined,
  writeEvent: (event: object) => Promise<void>,
): Promise<boolean> {
  if (!sandboxReady) return true;
  try {
    await sandboxReady;
    return true;
  } catch (err) {
    await writeEvent({
      type: "error",
      error: { message: `Sandbox initialization failed: ${String(err)}` },
    });
    return false;
  }
}
