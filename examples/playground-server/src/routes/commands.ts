/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { getSlashCommandDefinitions } from "@/commands/registry.js";
import { createCommandsRoute, createSlashCommandRegistry } from "@agentrail/app";

const commands = createCommandsRoute(createSlashCommandRegistry(getSlashCommandDefinitions()));

export { commands };
