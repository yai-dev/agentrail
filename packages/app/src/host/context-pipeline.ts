/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Single implementation lives in @agentrail/capabilities; re-export from here
// so that consumers who import from @agentrail/app get the exact same functions
// and avoid any structural type mismatch.
export {
  createTransformContext,
  createContextProviderFromTransform,
} from "@agentrail/capabilities";
