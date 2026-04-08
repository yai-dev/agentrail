/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createUserMemoryPlugin } from "@agentrail/app";
import { userMemoryConsolidationService } from "@/context/index.js";
import { createAttachmentHintsPlugin } from "@/plugins/attachment-hints.js";
import { createSlashCommandsPlugin } from "@/plugins/slash-commands.js";

export const playgroundPlugins = [
  createUserMemoryPlugin(userMemoryConsolidationService),
  createAttachmentHintsPlugin(),
  createSlashCommandsPlugin(),
];
