/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { AgentrailProfile, AgentrailProfileContext } from "@/host/types.js";
import type { ProfileDefinition } from "@/profile/define-profile.js";
import type { AgentrailSessionStore, SessionRef } from "@agentrail/core";

/**
 * Formal contract for resolving a profile on a per-request basis.
 *
 * Implement this when you need tenant-aware, mode-aware, or feature-flag-aware
 * profile selection. Pass the resolver to `createAgentApp({ resolveProfile })`
 * or directly to `createChatRoute` / `createStreamRoute`.
 *
 * Return `null` to indicate that no profile matches — the route will respond
 * with a 404.
 *
 * @see {@link https://agentrail.run/reference/profile-contract}
 */
export type ProfileResolver = (input: {
  agentId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  sessionRef: SessionRef;
  sessionStore: AgentrailSessionStore;
}) => Promise<ProfileDefinition | null>;

/**
 * Builds a static profile resolver backed by a fixed list of profiles.
 *
 * This is the simplest resolver — it maps `agentId` to a profile from
 * the provided array. For dynamic routing (tenant-aware, feature-flag-aware,
 * etc.) implement `ProfileResolver` directly and pass it to
 * `createAgentApp({ resolveProfile })`.
 *
 * @see {@link ProfileResolver}
 */
export function createStaticProfileResolver(
  profiles: ProfileDefinition[],
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

/**
 * @deprecated Use `createStaticProfileResolver()` instead.
 *             For dynamic routing, implement `ProfileResolver` directly.
 */
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
