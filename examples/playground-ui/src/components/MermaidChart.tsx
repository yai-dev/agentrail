/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import mermaid from "mermaid";
import { useEffect, useRef, useState } from "react";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    background: "#1a1a2e",
    primaryColor: "#7c6af7",
    primaryTextColor: "#e2e8f0",
    primaryBorderColor: "#4a4580",
    lineColor: "#8892b0",
    secondaryColor: "#16213e",
    tertiaryColor: "#0f3460",
    edgeLabelBackground: "#1a1a2e",
    fontSize: "13px",
  },
  flowchart: { curve: "basis" },
  pie: { textPosition: 0.75 },
});

// Global counter for unique mermaid render IDs
let renderCounter = 0;

interface Props {
  code: string;
}

export function MermaidChart({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;

    setError(null);

    // Each render needs a unique element ID — mermaid creates a temp element by this ID
    const renderId = `mermaid-render-${++renderCounter}`;

    mermaid
      .render(renderId, code)
      .then(({ svg }) => {
        if (cancelled || !containerRef.current) return;

        // Parse the returned SVG string into a real DOM node via DOMParser (safe, no innerHTML)
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, "image/svg+xml");
        const svgEl = doc.documentElement as unknown as SVGSVGElement;

        // Make it responsive
        svgEl.removeAttribute("height");
        svgEl.style.maxWidth = "100%";
        svgEl.style.height = "auto";

        // Replace container children
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
        containerRef.current.appendChild(
          document.adoptNode(svgEl)
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre
        style={{
          background: "var(--bg-surface, #1e1e2e)",
          border: "1px solid #ef444466",
          borderRadius: "6px",
          padding: "12px",
          fontSize: "12px",
          color: "#ef4444",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {code}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        background: "var(--bg-surface, #1e1e2e)",
        border: "1px solid var(--border, #333)",
        borderRadius: "8px",
        padding: "16px",
        margin: "8px 0",
        overflowX: "auto",
        textAlign: "center",
      }}
    />
  );
}
