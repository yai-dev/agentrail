/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useCallback, useState } from "react";
import { getIdentity, setIdentity } from "../api";

export interface Identity {
  tenantId: string;
  userId: string;
}

export function useIdentity() {
  const [identity, setIdentityState] = useState<Identity>(getIdentity);

  const saveIdentity = useCallback((tenantId: string, userId: string) => {
    setIdentity(tenantId, userId);
    setIdentityState({ tenantId, userId });
  }, []);

  const isConfigured = identity.tenantId.trim() !== "" && identity.userId.trim() !== "";

  return { identity, isConfigured, saveIdentity };
}
