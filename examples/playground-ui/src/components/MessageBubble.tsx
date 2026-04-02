/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { DisplayMessage } from "../App";
import { MermaidChart } from "./MermaidChart";
import { AuthenticatedMarkdownImage } from "./AuthenticatedMarkdownImage";

const MERMAID_LANG_RE = /language-mermaid/;

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    if (MERMAID_LANG_RE.test(className ?? "")) {
      return <MermaidChart code={String(children).trim()} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  img({ src, alt }) {
    return <AuthenticatedMarkdownImage className="message-markdown-image" src={src} alt={alt} />;
  },
};

interface Props {
  message: DisplayMessage;
}

function MessageBubbleInner({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const [thinkingOpen, setThinkingOpen] = useState(false);

  // thinking is "active" when: the message is streaming, has thinking text, but no reply text yet
  const isThinkingActive = message.streaming && !!message.thinking && !message.text;
  // show the thinking content when actively thinking OR when user has toggled it open
  const showThinkingContent = isThinkingActive || thinkingOpen;

  return (
    <div className={`message ${isUser ? "user" : isSystem ? "system" : "assistant"}`}>
      <div className="message-role">{isUser ? "你" : isSystem ? "Control" : "Agentrail"}</div>

      <div className="bubble">
        {/* Thinking block — only for assistant messages with thinking content */}
        {!isUser && !isSystem && message.thinking && (
          <div className="thinking-block">
            <button
              className={`thinking-toggle${isThinkingActive ? " active" : ""}`}
              onClick={isThinkingActive ? undefined : () => setThinkingOpen((o) => !o)}
              disabled={isThinkingActive}
            >
              <span className="thinking-toggle-icon">
                {isThinkingActive ? "◈" : thinkingOpen ? "▾" : "▸"}
              </span>
              {isThinkingActive ? (
                <>
                  思考中
                  <span className="streaming-cursor" />
                </>
              ) : (
                `思考过程 · ${message.thinking.length.toLocaleString()} 字符`
              )}
            </button>
            {showThinkingContent && <div className="thinking-content">{message.thinking}</div>}
          </div>
        )}

        {(message.text || (message.streaming && !message.thinking)) && (
          <div className="bubble-text">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.text}
            </ReactMarkdown>
            {message.streaming && <span className="streaming-cursor" />}
          </div>
        )}

        {message.streaming && !message.text && !message.thinking && (
          <span className="thinking-dots">
            <span />
            <span />
            <span />
          </span>
        )}
      </div>

      {message.usage && (
        <div className="usage-badge">
          <span className="usage-badge-divider" />
          <span>
            ↑ {message.usage.inputTokens.toLocaleString()}&nbsp;↓{" "}
            {message.usage.outputTokens.toLocaleString()} tokens
            {message.usage.cacheReadInputTokens
              ? ` · ${message.usage.cacheReadInputTokens.toLocaleString()} cached`
              : ""}
          </span>
          <span className="usage-badge-divider" />
        </div>
      )}
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner);
