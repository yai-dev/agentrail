/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { readFile } from "node:fs/promises";
import { tool } from "@agentrail/runtime-core";
import { Type } from "@sinclair/typebox";

const DEFAULT_READ_LINES = 100;
const MAX_LINE_LENGTH = 1000;
const BASH_TOOL_NAME = "Bash";

const toolName = "Read";
const toolLabel = "Read";

const toolDescription = `This tool reads a file from the local filesystem. 
You can access any file directly by using this tool. Assume this tool is able to read all files on the machine. 
If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to ${DEFAULT_READ_LINES} lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than ${MAX_LINE_LENGTH} characters will be truncated
- This tool can only read files, not directories. To read a directory, use an ls command via the ${BASH_TOOL_NAME} tool.
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
`;

const parametersSchema = Type.Object({
  file_path: Type.String({
    description: "The absolute path of the file to read.",
  }),
  offset: Type.Optional(
    Type.Integer({
      description:
        "The line number to start reading from (1-indexed). Negative values count backwards from the end of the file (e.g. -1 is the last line). Defaults to 1.",
      minimum: -Infinity,
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      description: `The maximum number of lines to read. Defaults to ${DEFAULT_READ_LINES}.`,
      minimum: 1,
    }),
  ),
});

export const readTool = tool()
  .name(toolName)
  .label(toolLabel)
  .description(toolDescription)
  .parameters(parametersSchema)
  .execute(async ({ file_path, offset, limit }) => {
    let raw: string;
    try {
      raw = await readFile(file_path, "utf-8");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error reading file: ${message}` }],
        details: { error: message },
      };
    }

    const allLines = raw.split("\n");
    const totalLines = allLines.length;

    if (raw === "") {
      return {
        content: [
          {
            type: "text" as const,
            text: "<system-reminder>File exists but has empty contents.</system-reminder>",
          },
        ],
        details: { totalLines: 0, lines: [] },
      };
    }

    const maxLines = limit ?? DEFAULT_READ_LINES;

    let startIndex: number;
    if (offset === undefined || offset === null) {
      startIndex = 0;
    } else if (offset < 0) {
      startIndex = Math.max(0, totalLines + offset);
    } else {
      startIndex = Math.max(0, offset - 1);
    }

    const selectedLines = allLines.slice(startIndex, startIndex + maxLines);

    const formattedLines = selectedLines.map((line, i) => {
      const lineNum = startIndex + i + 1;
      const truncated =
        line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + " [truncated]" : line;
      return `${String(lineNum).padStart(6)}|${truncated}`;
    });

    const text = formattedLines.join("\n");

    return {
      content: [{ type: "text" as const, text }],
      details: {
        totalLines,
        startLine: startIndex + 1,
        endLine: startIndex + selectedLines.length,
        lines: selectedLines,
      },
    };
  })
  .build();
