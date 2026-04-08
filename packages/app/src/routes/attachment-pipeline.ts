/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runAttachmentHandlers } from "@/host/plugins.js";
import type {
  AgentrailPlugin,
  AttachmentFile,
  AttachmentHandler,
  PluginErrorHandler,
} from "@/host/types.js";
import type { AttachmentInput } from "@/routes/stream-request.js";

/**
 * Persists base64-encoded attachments to the session upload directory and
 * returns structured metadata for each file.
 *
 * Throws when `dataDir` is absent but the request includes attachments.
 */
export async function persistUploadedFiles(
  dataDir: string | undefined,
  sessionId: string,
  attachments?: AttachmentInput[],
): Promise<AttachmentFile[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  if (!dataDir) {
    throw new Error(
      "stream route: dataDir is required when the request includes attachments. " +
        "Pass dataDir to createAgentApp() or createStreamRoute() to enable file upload support.",
    );
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

/**
 * Runs plugin attachment handlers and prepends the resulting context text to
 * the user message. Returns the original message unchanged when no files are
 * present.
 */
export async function buildEffectiveMessage(
  message: string | undefined,
  uploadedFiles: AttachmentFile[],
  plugins: AgentrailPlugin[],
  fallbackHandler?: AttachmentHandler,
  onPluginError?: PluginErrorHandler,
): Promise<string> {
  let effectiveMessage = message ?? "";
  if (uploadedFiles.length === 0) {
    return effectiveMessage;
  }

  const result = await runAttachmentHandlers(uploadedFiles, plugins, fallbackHandler, onPluginError);

  if (result?.contextText) {
    effectiveMessage = effectiveMessage
      ? `${result.contextText}\n\n---\n${effectiveMessage}`
      : result.contextText;
  }

  return effectiveMessage;
}
