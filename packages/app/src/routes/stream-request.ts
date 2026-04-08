/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

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

export interface AttachmentInput {
  name: string;
  base64: string;
  mimeType: string;
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
