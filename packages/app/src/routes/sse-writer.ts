/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

interface SseTextStream {
  write(chunk: string): Promise<unknown>;
}

/** Creates helpers that serialize Agentrail stream events into the response body. */
export function createSseEventWriter(textStream: SseTextStream) {
  const writeEvent = async (event: object) => {
    await textStream.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  return {
    writeEvent,
    forwardSubAgentEvent(event: object) {
      void writeEvent(event);
    },
  };
}
