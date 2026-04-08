/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createProfileResolver } from "@/host/profile-registry.js";
import type { HostedProfileDefinition } from "@/host/defaults/shared-types.js";

/**
 * Defines a hosted profile without changing its runtime behavior.
 *
 * @deprecated Use `defineProfile()` from `@agentrail/app` instead.
 * `defineProfile` supports capability descriptors and is the recommended way
 * to define agent profiles going forward.
 *
 * @see {@link https://agentrail.run/concepts/profiles}
 */
export function defineHostedProfile<T extends HostedProfileDefinition>(profile: T): T {
  return profile;
}

/**
 * Builds a profile resolver from a list of hosted profile definitions.
 *
 * @deprecated Use `createProfileResolver()` from `@agentrail/app` instead.
 *
 * @see {@link https://agentrail.run/reference/host-primitives}
 */
export function createHostedProfileResolver(profiles: HostedProfileDefinition[]) {
  return createProfileResolver(profiles);
}
