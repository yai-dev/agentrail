# 添加上下文

`ContextProvider` 是向托管请求注入运行期上下文的主要方式。若需要改写已有历史，而不是仅仅在前面补消息，应使用 Transform Context，而不是把这类逻辑硬塞进 `Context Provider`。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [构建 Profile](./build-a-profile.md)
- [上下文与压缩](../concepts/context-and-compaction.md)

上下文机制主要用来回答以下问题：

- 在运行期历史之前，应该额外放入哪些信息
- Agent 在当前请求中应该看到哪些身份、租户或环境提示
- 哪些 memory、knowledge 或 workspace 摘要应在请求时可见

如果说 `Profile` 定义的是 Agent「是谁」，那么 `Context Provider` 定义的就是 Agent「在请求时知道什么」。

## 常见上下文输入

常见的上下文输入包括：

- 用户身份
- memory 摘要
- knowledge 摘要
- skills 摘要
- workspace 快照
- 日期与运行期元数据

这些信息通常会以合成的 user message 形式，插入到对话历史之前。

## 两种主要方式

### 1. 直接添加 `ContextProvider`

当逻辑可以很直接地表达为「返回几条消息」时，优先使用 `Context Provider`：

```ts
import type { ContextProvider } from "@agentrail/app";

const identityProvider: ContextProvider = async (context) => {
  return [
    {
      role: "user",
      content: `Current tenant: ${context.tenantId}\nCurrent user: ${context.userId}`,
      timestamp: Date.now(),
    },
  ];
};
```

这是最直接、也最清晰的方式。

### 2. 添加 `TransformContextFn`

当需求不是「补充消息」，而是「改写已有消息数组」时，应使用 Transform Context：

- 压缩过大的 `toolResult`
- 对历史做脱敏或规范化
- 把多个请求期改写步骤串联起来

可使用 `createTransformContext(...)` 将 Transform Context 与 `Context Provider` 组合到一起。`createContextProviderFromTransform(...)` 仍然存在，但它只是旧的 prepend-only 适配方式，不再是表达改写逻辑的推荐方式。

## 推荐方式

如果 Host 采用默认 capability 模型，优先使用：

- `createDefaultCapabilityContextProviders`
- `createDefaultCapabilityTransformContext`

这种方式尤其适合组合以下内容：

- memory 索引摘要
- knowledge 元数据摘要
- skills 清单上下文
- workspace 快照

当前实现位于：

- [packages/capabilities/src/memory/context.ts](https://github.com/yai-dev/agentrail/blob/main/packages/capabilities/src/memory/context.ts)

## 仓库中的参考示例

playground 示例在这里组装请求上下文：

- [examples/playground-server/src/context/index.ts](https://github.com/yai-dev/agentrail/blob/main/examples/playground-server/src/context/index.ts)

这个文件适合参考以下问题：

- 如何把 Manager 单例放在 Route 文件之外
- 如何按请求构建 `Context Providers`
- 如何把框架默认能力与示例应用自己的运行期接线组合起来

## 顺序很重要

`Context Providers` 并不是一组可随意交换顺序的辅助函数。顺序会影响模型最终看到的 prompt。

一般建议：

- 身份、日期、环境头信息放在最前
- memory 与 knowledge 摘要放在当前请求历史之前
- workspace 快照放在足够靠后的位置，以反映最新状态

如果 `Context Provider` 之间开始依赖复杂的隐式顺序，通常说明应该把它们重新分组或简化。

## 适合放进 `Context Provider` 的内容

适合的内容通常具备以下特点：

- 体积紧凑
- 在单次请求中相对稳定
- 明确属于信息补充
- 可以安全地作为合成上下文插入

不适合的内容包括：

- 实际属于 `System Prompt` 的文本
- route 专属的分支逻辑
- 大段原始文档，而不是摘要或索引

## 常见误区

避免以下做法：

- 每次请求都注入过多原始状态
- 将 prompt 身份与请求期上下文混在一起
- 直接在 route handler 中拼接上下文
- 用 `Context Provider` 处理本应由工具负责的行为

## 更底层的 API

如果默认层过于固定，可以直接使用以下原语：

- `ContextProvider`
- `TransformContextFn`
- `composeTransformContexts`
- `createTransformContext`
- `createContextProviderFromTransform`

这些能力位于 `@agentrail/app/advanced` 与 `@agentrail/capabilities` 中，可在不采用默认 capability 栈的前提下，自定义一条上下文处理管线。

## 相关文档

- [构建 Profile](./build-a-profile.md)
- [兼容 API](../reference/host-defaults.md)
- [Session Store](../reference/session-store.md)

## 下一步

上下文管线就绪后，常见的下一步是扩展插件或管理 Prompt。可继续阅读 [编写插件](./write-a-plugin.md) 或 [管理 Prompt](./manage-prompts.md)。
