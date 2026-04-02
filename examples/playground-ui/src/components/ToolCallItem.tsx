/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState } from "react";
import type { DisplayToolCall } from "../App";
import { extractResultText } from "../api";

interface Props {
  tool: DisplayToolCall;
}

export function ToolCallItem({ tool }: Props) {
  const [open, setOpen] = useState(false);

  const statusClass = !tool.done ? "pending" : tool.isError ? "error" : "done";

  return (
    <div className="tool-item">
      <button className="tool-header" onClick={() => setOpen((o) => !o)}>
        <span className={`tool-dot ${statusClass}`} />
        <span className={`tool-name ${tool.isError ? "error" : ""}`}>{tool.name}</span>
        {!tool.done && <span className="tool-status-label">running…</span>}
        {tool.isError && <span className="tool-status-label error">error</span>}
        <span className={`tool-chevron ${open ? "open" : ""}`}>▶</span>
      </button>

      {open && (
        <div className="tool-body">
          <span className="tool-section-label">Arguments</span>
          <pre className="tool-code">
            {typeof tool.args === "string" ? tool.args : JSON.stringify(tool.args, null, 2)}
          </pre>

          {tool.done && (
            <>
              <span className="tool-section-label">Output</span>
              <pre className="tool-code">{extractResultText(tool.result)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
