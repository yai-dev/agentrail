/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createUserMemoryPlugin } from "@agentrail/app";
import { userMemoryConsolidationService } from "../context/index.js";
import { createAttachmentHintsPlugin } from "./attachment-hints.js";
import { createSlashCommandsPlugin } from "./slash-commands.js";

export const playgroundPlugins = [
  createUserMemoryPlugin(userMemoryConsolidationService),
  createAttachmentHintsPlugin(),
  createSlashCommandsPlugin(),
];
