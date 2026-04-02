/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState, useCallback } from "react";

export interface SessionMeta {
  sessionId: string;
  title: string | null;
  lastMessage: string;
  updatedAt: number;
}

const STORAGE_KEY = "agentrail-playground-sessions";

function loadFromStorage(): SessionMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SessionMeta[];
  } catch {
    return [];
  }
}

function saveToStorage(sessions: SessionMeta[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionMeta[]>(loadFromStorage);

  const upsert = useCallback((meta: SessionMeta) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.sessionId !== meta.sessionId);
      // Most-recent first
      const updated = [meta, ...next];
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const remove = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.sessionId !== sessionId);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const updateTitle = useCallback((sessionId: string, title: string) => {
    setSessions((prev) => {
      const updated = prev.map((s) => (s.sessionId === sessionId ? { ...s, title } : s));
      saveToStorage(updated);
      return updated;
    });
  }, []);

  return { sessions, upsert, remove, updateTitle };
}
