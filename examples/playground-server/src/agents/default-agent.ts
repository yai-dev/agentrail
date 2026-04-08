/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Agent identity and factory are now fully declared in the profile.
// This file exists for backward-compatible re-exports only.
export {
  DEFAULT_HOSTED_AGENT_ID,
  playgroundDefaultProfile as defaultProfile,
} from "@/profiles/default-profile.js";
