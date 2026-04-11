/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import type { LlmProvider, LlmRequest, LlmStream } from "@/interfaces/llm-client.js";
import { AssistantMessageEventStream } from "@/llm/event-stream.js";
import { parseStreamingJson } from "@/llm/utils/json-parse.js";
import { sanitizeSurrogates } from "@/llm/utils/sanitize-unicode.js";
import type { TextContent, ToolCall } from "@/types/content.types.js";
import type { AssistantMessage, StopReason } from "@/types/message.types.js";
import OpenAI from "openai";

type MutableBlock = {
  type: "text" | "thinking" | "toolCall";
  text?: string;
  thinking?: string;
  thinkingSignature?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  partialArgs?: string;
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

/** OpenAI-compatible adapter that implements the Agentrail `LlmProvider` interface. */
export class OpenAiLlmProvider implements LlmProvider {
  readonly provider = "openai";

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
        const openaiStream = await client.chat.completions.create(params, {
          signal: request.signal,
        });

        stream.push({ type: "start", partial: this.toAssistantMessage(output) });

        let currentBlock: MutableBlock | null = null;
        const contentIndex = () => output.content.length - 1;

        const finishCurrentBlock = () => {
          if (!currentBlock) return;

          if (currentBlock.type === "text") {
            stream.push({
              type: "text_end",
              contentIndex: contentIndex(),
              content: currentBlock.text || "",
              partial: this.toAssistantMessage(output),
            });
          } else if (currentBlock.type === "thinking") {
            stream.push({
              type: "thinking_end",
              contentIndex: contentIndex(),
              content: currentBlock.thinking || "",
              partial: this.toAssistantMessage(output),
            });
          } else if (currentBlock.type === "toolCall") {
            currentBlock.arguments = parseStreamingJson(currentBlock.partialArgs);
            delete currentBlock.partialArgs;
            stream.push({
              type: "toolcall_end",
              contentIndex: contentIndex(),
              toolCall: {
                type: "toolCall",
                id: currentBlock.id || "",
                name: currentBlock.name || "",
                arguments: currentBlock.arguments || {},
              },
              partial: this.toAssistantMessage(output),
            });
          }
        };

        for await (const chunk of openaiStream) {
          if (chunk.usage) {
            const cachedTokens = (chunk.usage as any).prompt_tokens_details?.cached_tokens || 0;
            const reasoningTokens =
              (chunk.usage as any).completion_tokens_details?.reasoning_tokens || 0;
            const input = (chunk.usage.prompt_tokens || 0) - cachedTokens;
            const outputTokens = (chunk.usage.completion_tokens || 0) + reasoningTokens;

            output.usage = {
              inputTokens: input,
              outputTokens: outputTokens,
              cacheReadTokens: cachedTokens,
              cacheWriteTokens: 0,
              totalTokens: input + outputTokens + cachedTokens,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            };
          }

          const choice = chunk.choices[0];
          if (!choice) continue;

          if (choice.finish_reason) {
            output.stopReason = this.mapStopReason(choice.finish_reason);
          }

          if (choice.delta) {
            if (choice.delta.content && choice.delta.content.length > 0) {
              if (!currentBlock || currentBlock.type !== "text") {
                finishCurrentBlock();
                currentBlock = { type: "text", text: "" };
                output.content.push(currentBlock);
                stream.push({
                  type: "text_start",
                  contentIndex: contentIndex(),
                  partial: this.toAssistantMessage(output),
                });
              }

              if (currentBlock.type === "text") {
                currentBlock.text = (currentBlock.text || "") + choice.delta.content;
                stream.push({
                  type: "text_delta",
                  contentIndex: contentIndex(),
                  delta: choice.delta.content,
                  partial: this.toAssistantMessage(output),
                });
              }
            }

            const reasoningContent =
              (choice.delta as any).reasoning_content || (choice.delta as any).reasoning;
            if (reasoningContent && reasoningContent.length > 0) {
              if (!currentBlock || currentBlock.type !== "thinking") {
                finishCurrentBlock();
                currentBlock = {
                  type: "thinking",
                  thinking: "",
                  thinkingSignature: "reasoning",
                };
                output.content.push(currentBlock);
                stream.push({
                  type: "thinking_start",
                  contentIndex: contentIndex(),
                  partial: this.toAssistantMessage(output),
                });
              }

              if (currentBlock.type === "thinking") {
                currentBlock.thinking = (currentBlock.thinking || "") + reasoningContent;
                stream.push({
                  type: "thinking_delta",
                  contentIndex: contentIndex(),
                  delta: reasoningContent,
                  partial: this.toAssistantMessage(output),
                });
              }
            }

            if (choice.delta.tool_calls) {
              for (const toolCall of choice.delta.tool_calls) {
                if (
                  !currentBlock ||
                  currentBlock.type !== "toolCall" ||
                  (toolCall.id && currentBlock.id !== toolCall.id)
                ) {
                  finishCurrentBlock();
                  currentBlock = {
                    type: "toolCall",
                    id: toolCall.id || "",
                    name: toolCall.function?.name || "",
                    arguments: {},
                    partialArgs: "",
                  };
                  output.content.push(currentBlock);
                  stream.push({
                    type: "toolcall_start",
                    contentIndex: contentIndex(),
                    partial: this.toAssistantMessage(output),
                  });
                }

                if (currentBlock.type === "toolCall") {
                  if (toolCall.id) currentBlock.id = toolCall.id;
                  if (toolCall.function?.name) currentBlock.name = toolCall.function.name;

                  let delta = "";
                  if (toolCall.function?.arguments) {
                    delta = toolCall.function.arguments;
                    currentBlock.partialArgs =
                      (currentBlock.partialArgs || "") + toolCall.function.arguments;
                    currentBlock.arguments = parseStreamingJson(currentBlock.partialArgs);
                  }
                  stream.push({
                    type: "toolcall_delta",
                    contentIndex: contentIndex(),
                    delta,
                    partial: this.toAssistantMessage(output),
                  });
                }
              }
            }
          }
        }

        finishCurrentBlock();

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

  private createClient(request: LlmRequest): OpenAI {
    const apiKey = request.model.apiKey || process.env.OPENAI_API_KEY || "";
    return new OpenAI({
      apiKey,
      baseURL: request.model.baseUrl,
      dangerouslyAllowBrowser: true,
    });
  }

  private buildParams(request: LlmRequest): OpenAI.Chat.ChatCompletionCreateParamsStreaming {
    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: request.model.modelId,
      messages: this.convertMessages(request),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.maxTokens) {
      params.max_completion_tokens = request.maxTokens;
    }

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = this.convertTools(request.tools);
    }

    return params;
  }

  private convertMessages(request: LlmRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: sanitizeSurrogates(request.systemPrompt) });
    }

    for (const msg of request.messages) {
      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          messages.push({ role: "user", content: sanitizeSurrogates(msg.content) });
        } else {
          messages.push({
            role: "user",
            content: msg.content.map((c) =>
              c.type === "text"
                ? { type: "text" as const, text: sanitizeSurrogates(c.text) }
                : {
                    type: "image_url" as const,
                    image_url: { url: `data:${c.mimeType};base64,${c.data}` },
                  },
            ),
          });
        }
      } else if (msg.role === "assistant") {
        const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: null,
        };

        const nonEmptyTextBlocks = msg.content
          .filter((c) => c.type === "text")
          .filter((b) => (b as TextContent).text.trim().length > 0);
        if (nonEmptyTextBlocks.length > 0) {
          assistantMsg.content = nonEmptyTextBlocks.map((b) => ({
            type: "text" as const,
            text: sanitizeSurrogates((b as TextContent).text),
          }));
        }

        const toolCalls = msg.content.filter((c) => c.type === "toolCall");
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls.map((tc) => ({
            id: (tc as ToolCall).id,
            type: "function" as const,
            function: {
              name: (tc as ToolCall).name,
              arguments: JSON.stringify((tc as ToolCall).arguments),
            },
          }));
        }

        const hasContent = assistantMsg.content !== null && assistantMsg.content !== undefined;
        if (!hasContent && !assistantMsg.tool_calls) continue;

        messages.push(assistantMsg);
      } else {
        const textResult = msg.content
          .filter((c) => c.type === "text")
          .map((c) => (c as TextContent).text)
          .join("\n");

        messages.push({
          role: "tool",
          content: sanitizeSurrogates(textResult || "(tool result)"),
          tool_call_id: msg.toolCallId,
        });
      }
    }

    return messages;
  }

  private convertTools(tools: LlmRequest["tools"]): OpenAI.Chat.ChatCompletionTool[] {
    return tools!.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as any,
      },
    }));
  }

  private mapStopReason(
    reason: OpenAI.Chat.ChatCompletionChunk.Choice["finish_reason"],
  ): StopReason {
    if (reason === null) return "stop";
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "tool_calls":
      case "function_call":
        return "toolUse";
      case "content_filter":
        return "error";
      default:
        return "stop";
    }
  }
}
