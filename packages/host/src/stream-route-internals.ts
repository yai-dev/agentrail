/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { TransformContextFn } from "@agentrail/runtime-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTransformContext } from "./context-pipeline.js";
import { collectPluginContextProviders, runAttachmentHandlers } from "./plugins.js";
import type {
  AgentrailPlugin,
  AttachmentFile,
  AttachmentHandler,
  ContextProvider,
} from "./types.js";

interface AttachmentInput {
  name: string;
  base64: string;
  mimeType: string;
}

/** Parsed request body accepted by the streaming route. */
export interface StreamRequest {
  message: string;
  agentId?: string;
  mode?: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
  attachments?: AttachmentInput[];
}

interface SseTextStream {
  write(chunk: string): Promise<unknown>;
}

/** Validates a streaming request body and returns a normalized result. */
export function validateStreamRequest(
  body: StreamRequest,
): { valid: true } | { valid: false; error: string } {
  const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;

  if ((!body.message || typeof body.message !== "string") && !hasAttachments) {
    return {
      valid: false,
      error: "Field 'message' is required and must be a string",
    };
  }
  if (!body.tenantId || typeof body.tenantId !== "string") {
    return { valid: false, error: "Field 'tenantId' is required" };
  }
  if (!body.userId || typeof body.userId !== "string") {
    return { valid: false, error: "Field 'userId' is required" };
  }

  return { valid: true };
}

export async function persistUploadedFiles(
  dataDir: string,
  sessionId: string,
  attachments?: AttachmentInput[],
): Promise<AttachmentFile[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const uploadsDir = path.join(dataDir, "sandboxes", sessionId, "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const uploadedFiles: AttachmentFile[] = [];
  for (const attachment of attachments) {
    const safeName = attachment.name.replace(/[^a-zA-Z0-9._\-]/g, "_");
    const buffer = Buffer.from(attachment.base64, "base64");
    await writeFile(path.join(uploadsDir, safeName), buffer);
    uploadedFiles.push({
      name: attachment.name,
      mimeType: attachment.mimeType,
      containerPath: `/workspace/uploads/${safeName}`,
      sizeKb: Math.round(buffer.length / 1024),
    });
  }

  return uploadedFiles;
}

export async function buildEffectiveMessage(
  message: string | undefined,
  uploadedFiles: AttachmentFile[],
  plugins: AgentrailPlugin[],
  fallbackHandler?: AttachmentHandler,
): Promise<string> {
  let effectiveMessage = message ?? "";
  if (uploadedFiles.length === 0) {
    return effectiveMessage;
  }

  const result = await runAttachmentHandlers(uploadedFiles, plugins, fallbackHandler);

  if (result?.contextText) {
    effectiveMessage = effectiveMessage
      ? `${result.contextText}\n\n---\n${effectiveMessage}`
      : result.contextText;
  }

  return effectiveMessage;
}

export async function resolveStreamTransformContext(
  options: {
    getTransformContext?: (context: {
      tenantId: string;
      userId: string;
      sessionId: string;
    }) => Promise<TransformContextFn> | TransformContextFn;
    getContextProviders?: (context: {
      tenantId: string;
      userId: string;
      sessionId: string;
    }) => Promise<ContextProvider[]> | ContextProvider[];
    contextProviders?: ContextProvider[];
  },
  plugins: AgentrailPlugin[],
  context: {
    tenantId: string;
    userId: string;
    sessionId: string;
  },
): Promise<TransformContextFn> {
  if (options.getTransformContext) {
    return options.getTransformContext(context);
  }

  return createTransformContext(
    collectPluginContextProviders(
      plugins,
      options.getContextProviders
        ? await options.getContextProviders(context)
        : (options.contextProviders ?? []),
    ),
    context,
  );
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
