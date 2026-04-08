/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmRequest, LlmStream } from "@/interfaces/llm-client.js";
import type { ImageContent, TextContent } from "@/types/content.types.js";
import type { AssistantMessage, StopReason, ToolResultMessage } from "@/types/message.types.js";
import { AssistantMessageEventStream } from "@/llm/event-stream.js";
import { parseStreamingJson } from "@/llm/utils/json-parse.js";
import { sanitizeSurrogates } from "@/llm/utils/sanitize-unicode.js";

type MutableBlock = {
  type: "text" | "thinking" | "toolCall";
  text?: string;
  thinking?: string;
  thinkingSignature?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  index?: number;
  partialJson?: string;
};

type MutableAssistantMessage = {
  role: "assistant";
  content: MutableBlock[];
  provider: string;
  modelId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  };
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
};

/** Anthropic adapter that implements the Agentrail `LlmProvider` interface. */
export class AnthropicLlmProvider implements LlmProvider {
  readonly provider = "anthropic";

  stream(request: LlmRequest): LlmStream {
    const stream = new AssistantMessageEventStream();

    (async () => {
      const output: MutableAssistantMessage = {
        role: "assistant",
        content: [],
        provider: request.model.provider,
        modelId: request.model.modelId,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      };

      try {
        const client = this.createClient(request);
        const params = this.buildParams(request);
        const anthropicStream = client.messages.stream(
          { ...params, stream: true },
          { signal: request.signal },
        );

        stream.push({ type: "start", partial: this.toAssistantMessage(output) });

        // Use type assertion to handle stream events
        for await (const event of anthropicStream as AsyncIterable<any>) {
          if (event.type === "message_start") {
            const msg = event.message;
            output.usage.inputTokens = msg?.usage?.input_tokens || 0;
            output.usage.outputTokens = msg?.usage?.output_tokens || 0;
            output.usage.cacheReadTokens = msg?.usage?.cache_read_input_tokens || 0;
            output.usage.cacheWriteTokens = msg?.usage?.cache_creation_input_tokens || 0;
            output.usage.totalTokens =
              output.usage.inputTokens +
              output.usage.outputTokens +
              output.usage.cacheReadTokens +
              output.usage.cacheWriteTokens;
          } else if (event.type === "content_block_start") {
            this.handleContentBlockStart(event, output, stream);
          } else if (event.type === "content_block_delta") {
            this.handleContentBlockDelta(event, output, stream);
          } else if (event.type === "content_block_stop") {
            this.handleContentBlockStop(event, output, stream);
          } else if (event.type === "message_delta") {
            if (event.delta?.stop_reason) {
              output.stopReason = this.mapStopReason(event.delta.stop_reason);
            }
            const usage = event.usage || {};
            if (usage.output_tokens != null) {
              output.usage.outputTokens = usage.output_tokens;
            }
            output.usage.totalTokens =
              output.usage.inputTokens +
              output.usage.outputTokens +
              output.usage.cacheReadTokens +
              output.usage.cacheWriteTokens;
          }
        }

        if (request.signal?.aborted) {
          throw new Error("Request was aborted");
        }

        const doneReason = output.stopReason as Extract<StopReason, "stop" | "length" | "toolUse">;
        stream.push({ type: "done", reason: doneReason, message: this.toAssistantMessage(output) });
        stream.end();
      } catch (error) {
        output.stopReason = request.signal?.aborted ? "aborted" : "error";
        output.errorMessage = error instanceof Error ? error.message : String(error);
        const errorReason = output.stopReason as Extract<StopReason, "error" | "aborted">;
        stream.push({
          type: "error",
          reason: errorReason,
          message: this.toAssistantMessage(output),
        });
        stream.end();
      }
    })();

    return stream;
  }

  private toAssistantMessage(mutable: MutableAssistantMessage): AssistantMessage {
    return {
      role: mutable.role,
      content: mutable.content.map((block) => {
        if (block.type === "text") {
          return { type: "text" as const, text: block.text || "" };
        } else if (block.type === "thinking") {
          return {
            type: "thinking" as const,
            thinking: block.thinking || "",
            thinkingSignature: block.thinkingSignature,
          };
        } else {
          return {
            type: "toolCall" as const,
            id: block.id || "",
            name: block.name || "",
            arguments: block.arguments || {},
          };
        }
      }),
      provider: mutable.provider,
      modelId: mutable.modelId,
      usage: mutable.usage,
      stopReason: mutable.stopReason,
      errorMessage: mutable.errorMessage,
      timestamp: mutable.timestamp,
    };
  }

  private createClient(request: LlmRequest): Anthropic {
    const apiKey = request.model.apiKey || process.env.ANTHROPIC_API_KEY || "";
    return new Anthropic({
      apiKey,
      baseURL: request.model.baseUrl,
      dangerouslyAllowBrowser: true,
    });
  }

  private buildParams(request: LlmRequest): Anthropic.Messages.MessageCreateParamsStreaming {
    const convertedMessages = this.convertMessages(request.messages);

    // Add cache_control to the second-to-last message so the full conversation
    // history (except the current user turn) is eligible for caching on the
    // next LLM call within the same Agent Loop iteration.
    if (convertedMessages.length >= 2) {
      const target = convertedMessages[convertedMessages.length - 2]!;
      const content = target.content;
      if (Array.isArray(content) && content.length > 0) {
        (content[content.length - 1] as unknown as Record<string, unknown>).cache_control = {
          type: "ephemeral",
        };
      } else if (typeof content === "string") {
        target.content = [{ type: "text", text: content, cache_control: { type: "ephemeral" } }];
      }
    }

    const params: Anthropic.Messages.MessageCreateParamsStreaming = {
      model: request.model.modelId,
      messages: convertedMessages,
      max_tokens: request.maxTokens || 4096,
      stream: true,
    };

    // Pass system prompt as a typed array block so cache_control is supported.
    if (request.systemPrompt) {
      params.system = [
        {
          type: "text",
          text: sanitizeSurrogates(request.systemPrompt),
          cache_control: { type: "ephemeral" },
        },
      ] as Anthropic.Messages.TextBlockParam[];
    }

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = this.convertTools(request.tools);
    }

    if (request.thinkingEnabled) {
      params.thinking = { type: "enabled", budget_tokens: 1024 };
    }

    return params;
  }

  private convertMessages(messages: LlmRequest["messages"]): Anthropic.Messages.MessageParam[] {
    const params: Anthropic.Messages.MessageParam[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          params.push({ role: "user", content: sanitizeSurrogates(msg.content) });
        } else {
          const blocks = msg.content.map((c): Anthropic.Messages.ContentBlockParam => {
            if (c.type === "text") {
              return { type: "text", text: sanitizeSurrogates(c.text) };
            } else {
              return {
                type: "image",
                source: {
                  type: "base64",
                  media_type: c.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: c.data,
                },
              };
            }
          });
          params.push({ role: "user", content: blocks });
        }
      } else if (msg.role === "assistant") {
        const blocks: Anthropic.Messages.ContentBlockParam[] = [];

        for (const c of msg.content) {
          if (c.type === "text") {
            if (c.text.trim().length === 0) continue;
            blocks.push({ type: "text", text: sanitizeSurrogates(c.text) });
          } else if (c.type === "thinking") {
            if (c.thinking.trim().length === 0) continue;
            if (!c.thinkingSignature || c.thinkingSignature.trim().length === 0) {
              blocks.push({ type: "text", text: sanitizeSurrogates(c.thinking) });
            } else {
              blocks.push({
                type: "thinking",
                thinking: sanitizeSurrogates(c.thinking),
                signature: c.thinkingSignature,
              } as Anthropic.Messages.ContentBlockParam);
            }
          } else {
            blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
          }
        }

        if (blocks.length === 0) continue;
        params.push({ role: "assistant", content: blocks });
      } else {
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        toolResults.push({
          type: "tool_result",
          tool_use_id: msg.toolCallId,
          content: this.convertToolResultContent(msg.content),
          is_error: msg.isError,
        });

        let j = i + 1;
        while (j < messages.length && messages[j].role === "toolResult") {
          const nextMsg = messages[j] as ToolResultMessage;
          toolResults.push({
            type: "tool_result",
            tool_use_id: nextMsg.toolCallId,
            content: this.convertToolResultContent(nextMsg.content),
            is_error: nextMsg.isError,
          });
          j++;
        }

        i = j - 1;

        params.push({ role: "user", content: toolResults });
      }
    }

    return params;
  }

  private convertToolResultContent(
    content: (TextContent | ImageContent)[],
  ): string | Anthropic.Messages.ToolResultBlockParam["content"] {
    const hasImages = content.some((c) => c.type === "image");
    if (!hasImages) {
      return content
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => c.text)
        .join("\n");
    }
    return content.map(
      (c): Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam => {
        if (c.type === "text") {
          return { type: "text", text: sanitizeSurrogates(c.text) };
        } else {
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: c.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: c.data,
            },
          };
        }
      },
    );
  }

  private convertTools(tools: LlmRequest["tools"]): Anthropic.Messages.Tool[] {
    const converted: Anthropic.Messages.Tool[] = tools!.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
        properties: (tool.parameters as any).properties || {},
        required: (tool.parameters as any).required || [],
      },
    }));

    // Mark the last tool so the entire tools array is covered by a single
    // cache breakpoint — tools are stable within a session for a given tenant.
    if (converted.length > 0) {
      (converted[converted.length - 1] as unknown as Record<string, unknown>).cache_control = {
        type: "ephemeral",
      };
    }

    return converted;
  }

  private handleContentBlockStart(
    event: any,
    output: MutableAssistantMessage,
    stream: AssistantMessageEventStream,
  ): void {
    const block = event.content_block;
    if (!block) return;

    if (block.type === "text") {
      output.content.push({ type: "text", text: "", index: event.index });
      stream.push({
        type: "text_start",
        contentIndex: output.content.length - 1,
        partial: this.toAssistantMessage(output),
      });
    } else if (block.type === "thinking") {
      output.content.push({
        type: "thinking",
        thinking: "",
        thinkingSignature: "",
        index: event.index,
      });
      stream.push({
        type: "thinking_start",
        contentIndex: output.content.length - 1,
        partial: this.toAssistantMessage(output),
      });
    } else if (block.type === "tool_use") {
      output.content.push({
        type: "toolCall",
        id: block.id,
        name: block.name,
        arguments: (block.input as Record<string, unknown>) ?? {},
        partialJson: "",
        index: event.index,
      });
      stream.push({
        type: "toolcall_start",
        contentIndex: output.content.length - 1,
        partial: this.toAssistantMessage(output),
      });
    }
  }

  private handleContentBlockDelta(
    event: any,
    output: MutableAssistantMessage,
    stream: AssistantMessageEventStream,
  ): void {
    const block = output.content.find((b) => b.index === event.index);
    if (!block) return;

    const delta = event.delta;
    if (!delta) return;

    if (delta.type === "text_delta" && block.type === "text") {
      block.text = (block.text || "") + (delta.text || "");
      stream.push({
        type: "text_delta",
        contentIndex: event.index,
        delta: delta.text || "",
        partial: this.toAssistantMessage(output),
      });
    } else if (delta.type === "thinking_delta" && block.type === "thinking") {
      block.thinking = (block.thinking || "") + (delta.thinking || "");
      stream.push({
        type: "thinking_delta",
        contentIndex: event.index,
        delta: delta.thinking || "",
        partial: this.toAssistantMessage(output),
      });
    } else if (delta.type === "signature_delta" && block.type === "thinking") {
      block.thinkingSignature = (block.thinkingSignature || "") + (delta.signature || "");
    } else if (delta.type === "input_json_delta" && block.type === "toolCall") {
      block.partialJson = (block.partialJson || "") + (delta.partial_json || "");
      block.arguments = parseStreamingJson(block.partialJson);
      stream.push({
        type: "toolcall_delta",
        contentIndex: event.index,
        delta: delta.partial_json || "",
        partial: this.toAssistantMessage(output),
      });
    }
  }

  private handleContentBlockStop(
    event: any,
    output: MutableAssistantMessage,
    stream: AssistantMessageEventStream,
  ): void {
    const block = output.content.find((b) => b.index === event.index);
    if (!block) return;

    block.index = undefined;
    block.partialJson = undefined;

    if (block.type === "text") {
      stream.push({
        type: "text_end",
        contentIndex: event.index,
        content: block.text || "",
        partial: this.toAssistantMessage(output),
      });
    } else if (block.type === "thinking") {
      stream.push({
        type: "thinking_end",
        contentIndex: event.index,
        content: block.thinking || "",
        partial: this.toAssistantMessage(output),
      });
    } else if (block.type === "toolCall") {
      stream.push({
        type: "toolcall_end",
        contentIndex: event.index,
        toolCall: {
          type: "toolCall",
          id: block.id || "",
          name: block.name || "",
          arguments: block.arguments || {},
        },
        partial: this.toAssistantMessage(output),
      });
    }
  }

  private mapStopReason(reason: string): StopReason {
    switch (reason) {
      case "end_turn":
        return "stop";
      case "max_tokens":
        return "length";
      case "tool_use":
        return "toolUse";
      case "stop_sequence":
        return "stop";
      default:
        return "stop";
    }
  }
}
