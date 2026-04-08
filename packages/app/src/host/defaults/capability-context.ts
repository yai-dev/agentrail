/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

// Single source of truth lives in @agentrail/capabilities.
// This file is kept as a thin re-export so that existing consumers importing
// from @agentrail/app continue to work without changes.
export {
  createDefaultCapabilityContextProviders,
  createDefaultCapabilityTransformContext,
} from "@agentrail/capabilities";
