/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailPlugin } from "@agentrail/host";

export function createAttachmentHintsPlugin(): AgentrailPlugin {
  return {
    name: "playground-attachment-hints",
    attachmentHandler: async (files) => {
      if (files.length === 0) {
        return null;
      }

      const fileLines = files
        .map((file) => `- ${file.name} (${file.sizeKb} KB) -> ${file.containerPath}`)
        .join("\n");

      return {
        contextText: [
          "[Uploaded Files]",
          "The following files are available under /workspace/uploads/:",
          fileLines,
          "",
          "Hints:",
          "- Use the xlsx skill for .xlsx/.xls files.",
          "- Use the docx skill for .docx files.",
          "- Use the read tool directly for .txt/.md/.csv files.",
        ].join("\n"),
      };
    },
  };
}
