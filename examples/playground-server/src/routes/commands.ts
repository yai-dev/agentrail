/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createCommandsRoute, createSlashCommandRegistry } from "@agentrail/slash-commands";
import { getSlashCommandDefinitions } from "../commands/registry.js";

const commands = createCommandsRoute(
  createSlashCommandRegistry(getSlashCommandDefinitions()),
);

export { commands };
