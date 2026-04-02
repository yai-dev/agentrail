/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { createProfileResolver } from "../profile-registry.js";
import type { HostedProfileDefinition } from "./shared-types.js";

/**
 * Defines a hosted profile without changing its runtime behavior.
 * The helper exists to make the recommended SDK path explicit.
 *
 * @see {@link https://agentrail.run/reference/host-defaults}
 */
export function defineHostedProfile<T extends HostedProfileDefinition>(profile: T): T {
  return profile;
}

/**
 * Builds the recommended hosted-profile resolver used by example hosts.
 *
 * @see {@link https://agentrail.run/reference/host-defaults}
 */
export function createHostedProfileResolver(profiles: HostedProfileDefinition[]) {
  return createProfileResolver(profiles);
}
