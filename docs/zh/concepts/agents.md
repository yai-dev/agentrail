# Agent

Agent 是 Agentrail 中最核心的运行时执行单元。它接收消息、调用 LLM、调度工具，并产出消息或流式事件。

## Agent 是什么

在运行时层，一个 Agent 是满足 `@agentrail/core` 中 `Agent` 接口的值。它通常包含：

- 模型配置，如 Provider、Model ID 与 API Key
- 系统提示词
- 可调用工具集合
- 循环控制参数，如最大轮数与 token 限制

Agent 本身不保存跨轮次状态。会话历史由 Host 层管理，而不是由 Agent 自己管理。

## 如何定义 Agent

通常使用 `defineAgent`：

```ts
import { defineAgent } from "@agentrail/core";

const agent = defineAgent({
  id: "my-agent",
  model: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  system: "You are a helpful assistant.",
  tools: [myTool],
  maxTurns: 20,
});
```

在托管应用中，通常不会在路由层直接构建 Agent，而是把这段逻辑放进 Profile 的 `createAgent` 中，让每个请求都按当前上下文重新构建。

## 主要配置项

| 字段              | 类型                                           | 用途                           |
| ----------------- | ---------------------------------------------- | ------------------------------ |
| `id`              | `string`                                       | Agent 唯一标识                 |
| `name`            | `string?`                                      | 面向日志与 UI 的可读名称       |
| `model`           | `string \| ModelConfig`                        | 模型提供方与模型配置           |
| `system`          | `string`                                       | 系统提示词                     |
| `tools`           | `RuntimeTool[] \| Record<string, RuntimeTool>` | Agent 可调用工具               |
| `maxTurns`        | `number?`                                      | 最大 LLM 循环轮数              |
| `maxTurnsMessage` | `string?`                                      | 最后一轮强制收束时附加的提示   |
| `maxTokens`       | `number?`                                      | 单次 LLM 调用的输出 token 上限 |
| `temperature`     | `number?`                                      | 采样温度                       |
| `thinkingEnabled` | `boolean?`                                     | 是否开启扩展思考模式           |

## `model` 的两种写法

`model` 既可以用简写，也可以用完整对象：

```ts
model: "anthropic:claude-sonnet-4-5";
```

```ts
model: {
  provider: "anthropic",
  modelId: "claude-sonnet-4-5",
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: "https://custom-proxy.example.com",
}
```

在生产环境中，凭据统一通过环境变量提供，不直接写入源码。

## Agent Loop

Agent 运行时会执行以下循环：

1. 用当前消息列表调用 LLM
2. 如果模型返回工具调用，则执行工具
3. 将工具结果追加回消息列表
4. 继续下一轮 LLM 调用
5. 当模型返回最终文本，或达到 `maxTurns` 时结束

## Agent 与 Profile 的区别

这两个概念分别属于不同层级：

- Agent：运行时概念，负责执行循环、模型、工具与系统提示词
- Profile：Host 概念，负责说明「针对一个请求，应如何构建 Agent」

在大多数托管应用中，业务代码主要写在 Profile 层，而不是直接暴露原始 Agent。

## 相关文档

- [工具](tools.md)
- [构建 Profile](../guides/build-a-profile.md)
- [`createAgentApp` 参考](../reference/create-agent-app.md)
