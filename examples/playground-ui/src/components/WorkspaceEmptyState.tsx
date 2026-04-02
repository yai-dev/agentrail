/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type React from "react";

interface WorkspaceEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function WorkspaceEmptyState({ icon, title, description }: WorkspaceEmptyStateProps) {
  return (
    <div className="workspace-empty-shell">
      <section className="workspace-empty-card">
        <div className="workspace-empty-glyph">{icon}</div>
        <div className="workspace-empty-heading">{title}</div>
        <p className="workspace-empty-description">{description}</p>
      </section>
    </div>
  );
}
