/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createUserMemoryPlugin } from "@agentrail/plugin-user-memory";
import { createAttachmentHintsPlugin } from "./attachment-hints.js";
import { createSlashCommandsPlugin } from "./slash-commands.js";
import { userMemoryConsolidationService } from "../context/index.js";

export const playgroundPlugins = [
  createUserMemoryPlugin(userMemoryConsolidationService),
  createAttachmentHintsPlugin(),
  createSlashCommandsPlugin(),
];
