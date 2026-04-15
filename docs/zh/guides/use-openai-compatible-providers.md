# 使用 OpenAI 兼容 Provider

Agentrail 内建的 `openai` Provider 支持通过 `baseUrl` 覆盖默认地址，把 API 请求重定向到任何兼容 OpenAI Chat Completions API 的服务。因此，无需编写自定义 Provider，就可以接入 DeepSeek、Ollama、OpenRouter、Together AI 等服务。

## 工作方式

`ModelConfig.baseUrl` 会替换 Provider Client 的默认 API 基地址。当设置 `provider: "openai"` 且提供不同的 `baseUrl` 后，Agent Loop 中的所有 LLM 调用都会发往该地址，而不是 `api.openai.com`。

```ts
import { defineAgent } from "@agentrail/core";

const agent = defineAgent({
  id: "my-agent",
  model: {
    provider: "openai",
    modelId: "provider-specific-model-name",
    apiKey: process.env.MY_PROVIDER_API_KEY,
    baseUrl: "https://api.myprovider.com/v1",
  },
  system: "You are a helpful assistant.",
});
```

除了标准的 `import "@agentrail/core/providers"` 外，不需要额外安装包或做注册动作。

## 常见 Provider

| Provider    | `baseUrl`                      | API Key 环境变量     |
| ----------- | ------------------------------ | -------------------- |
| DeepSeek    | `https://api.deepseek.com/v1`  | `DEEPSEEK_API_KEY`   |
| Ollama      | `http://localhost:11434/v1`    | 不需要               |
| OpenRouter  | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| Together AI | `https://api.together.xyz/v1`  | `TOGETHER_API_KEY`   |

## 示例

### DeepSeek

```ts
const agent = defineAgent({
  id: "deepseek-agent",
  model: {
    provider: "openai",
    modelId: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: "https://api.deepseek.com/v1",
  },
  system: "You are a helpful assistant.",
});
```

### Ollama

Ollama 在本地暴露兼容 OpenAI 的接口，地址通常为 `http://localhost:11434/v1`，无需 API Key。

```ts
const agent = defineAgent({
  id: "ollama-agent",
  model: {
    provider: "openai",
    modelId: "llama3.2",
    baseUrl: "http://localhost:11434/v1",
  },
  system: "You are a helpful assistant.",
});
```

使用前应先拉取模型：

```bash
ollama pull llama3.2
```

### OpenRouter

```ts
const agent = defineAgent({
  id: "openrouter-agent",
  model: {
    provider: "openai",
    modelId: "meta-llama/llama-3.3-70b-instruct",
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1",
  },
  system: "You are a helpful assistant.",
});
```

可用模型 ID 可在 OpenRouter 的模型目录中查看。

### Together AI

```ts
const agent = defineAgent({
  id: "together-agent",
  model: {
    provider: "openai",
    modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    apiKey: process.env.TOGETHER_API_KEY,
    baseUrl: "https://api.together.xyz/v1",
  },
  system: "You are a helpful assistant.",
});
```

## 在 `defineProfile` 中使用 `modelConfig`

如果在 `defineProfile` 中使用的是模型字符串简写，也可以通过单独的 `modelConfig` 字段补充 `baseUrl`，而不必切换到完整 `ModelConfig` 对象：

```ts
import { defineProfile } from "@agentrail/app";

export const myProfile = defineProfile({
  id: "deepseek",
  name: "DeepSeek Agent",
  agent: {
    model: "openai:deepseek-chat",
    prompt: "You are a helpful assistant.",
  },
  modelConfig: {
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY,
  },
});
```

这里的 `modelConfig` 会在构建 Agent 时覆盖到模型字符串之上。

## 限制

并不是所有兼容 Provider 都完整实现了 OpenAI Chat Completions 规范。接入前应核对以下能力：

| 能力              | 说明                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| Tool Calling      | DeepSeek、OpenRouter、Together AI 在支持的模型上通常可用；并非所有 Ollama 模型都支持 |
| Streaming         | 大多可用，但仍应按具体模型验证                                                       |
| 结构化输出        | 随 Provider 和模型而异                                                               |
| Extended Thinking | 仅 Anthropic Provider 支持，不能通过 `baseUrl` 获得                                  |
| Vision / 图片输入 | 随 Provider 和模型而异                                                               |

如果某个 Provider 不支持 Tool Calling，只要注册了 Tools，Agent Loop 就可能失败。若只是纯文本生成、摘要或分类任务，大多数兼容 Provider 都能正常工作。

## 相关文档

- [Agent](../concepts/agents.md)
- [构建 Profile](./build-a-profile.md)
- [故障排查](./troubleshooting.md)
- [英文原文](../../guides/use-openai-compatible-providers.md)
