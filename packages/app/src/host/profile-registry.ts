/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailProfile, AgentrailProfileContext } from "./types.js";

/** Creates a profile resolver backed by a fixed list of hosted profiles. */
export function createProfileResolver(
  profiles: AgentrailProfile[],
): (
  agentId: string,
  context: AgentrailProfileContext,
  onSubAgentEvent?: (event: object) => void,
) => Promise<AgentrailProfile | null> {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  return async (
    agentId: string,
    _context: AgentrailProfileContext,
    _onSubAgentEvent?: (event: object) => void,
  ) => {
    return profileMap.get(agentId) ?? null;
  };
}
