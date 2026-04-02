/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

export interface TodoStorage {
  read(): Promise<string | null>;
  write(content: string): Promise<void>;
}
