/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useEffect, useState } from "react";
import { fetchAuthorizedBlobUrl } from "../api.js";

interface Props {
  src?: string;
  alt?: string;
  className?: string;
}

export function AuthenticatedMarkdownImage({ src, alt, className }: Props) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      setStatus("idle");
      return;
    }

    if (!src.startsWith("/api/")) {
      setResolvedSrc(src);
      setStatus("ready");
      return;
    }

    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    setResolvedSrc(null);
    setStatus("loading");

    fetchAuthorizedBlobUrl(src, ctrl.signal)
      .then((nextUrl) => {
        objectUrl = nextUrl;
        setResolvedSrc(nextUrl);
        setStatus("ready");
      })
      .catch(() => {
        setResolvedSrc(null);
        setStatus("failed");
      });

    return () => {
      ctrl.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (!src) return null;
  if (status === "loading" || (!resolvedSrc && status !== "failed")) {
    return <span className="deep-research-image-loading">加载图片中…</span>;
  }
  if (status === "failed" || !resolvedSrc) {
    return <span className="deep-research-image-loading">图片加载失败</span>;
  }

  return <img className={className} src={resolvedSrc} alt={alt ?? ""} onError={() => setStatus("failed")} />;
}
