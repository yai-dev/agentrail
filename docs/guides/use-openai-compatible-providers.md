# Using OpenAI-Compatible Providers

Agentrail's built-in `openai` provider accepts a `baseUrl` override that redirects API calls to any endpoint that implements the OpenAI chat completions API. This lets you use DeepSeek, Ollama, OpenRouter, Together AI, and other compatible services without writing a custom provider.

## How It Works

The `ModelConfig.baseUrl` field replaces the default API base URL for the provider client. When you set `provider: "openai"` and supply a different `baseUrl`, every LLM call in the agent loop goes to that endpoint instead of `api.openai.com`.

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

No additional packages or registration calls are needed — the standard `import "@agentrail/core/providers"` side-effect import is all that is required.

## Supported Providers

| Provider       | `baseUrl`                      | API key env var      |
| -------------- | ------------------------------ | -------------------- |
| DeepSeek       | `https://api.deepseek.com/v1`  | `DEEPSEEK_API_KEY`   |
| Ollama (local) | `http://localhost:11434/v1`    | not required         |
| OpenRouter     | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| Together AI    | `https://api.together.xyz/v1`  | `TOGETHER_API_KEY`   |

## Provider Examples

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

### Ollama (local)

Ollama exposes an OpenAI-compatible endpoint at `http://localhost:11434/v1`. No API key is required.

```ts
const agent = defineAgent({
  id: "ollama-agent",
  model: {
    provider: "openai",
    modelId: "llama3.2", // must match a model pulled with `ollama pull`
    baseUrl: "http://localhost:11434/v1",
  },
  system: "You are a helpful assistant.",
});
```

Pull the model before use:

```bash
ollama pull llama3.2
```

### OpenRouter

OpenRouter exposes hundreds of models behind a single OpenAI-compatible endpoint.

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

Find available model IDs in the [OpenRouter model catalog](https://openrouter.ai/models).

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

Find available model IDs in the [Together AI model catalog](https://api.together.ai/models).

## Using `modelConfig` on `defineProfile`

When using `defineProfile` with a shorthand model string, you can supply `baseUrl` via the separate `modelConfig` field instead of switching to the full `ModelConfig` object:

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

The `modelConfig` fields are merged on top of the model string at agent construction time.

## Limitations

Not all providers fully implement the OpenAI chat completions specification. Check the provider's documentation before relying on these features:

| Feature                               | Notes                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tool calling (function calling)       | Supported by DeepSeek, OpenRouter, Together AI for capable models; not supported by all Ollama models       |
| Streaming                             | Generally supported; verify with your specific model                                                        |
| Structured output (`response_format`) | Varies by provider and model                                                                                |
| Extended thinking                     | Only available on Anthropic models via the `anthropic` provider — not available through `baseUrl` overrides |
| Vision / image inputs                 | Varies by provider and model                                                                                |

When a provider does not support tool calling, the agent loop will fail if any tools are registered. For tool-free use cases (pure text generation, summarization, classification), most providers work without issue.

## Related Docs

- [Agents — Model Config](../concepts/agents.md#model-config)
- [Build a Profile](build-a-profile.md)
- [Troubleshooting — LLM Provider Errors](troubleshooting.md#llm-provider-errors)
