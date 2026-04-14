# `createAgentApp` 参考

`createAgentApp` 是构建 Agentrail HTTP 服务的主要入口。它会返回一个已经挂好 `/chat`、`/stream`，以及可选观测接口的 [Hono](https://hono.dev) 应用。

## 导入

```ts
import { createAgentApp } from "@agentrail/app";
```

## 最小示例

```ts
import { createAgentApp, defineProfile } from "@agentrail/app";

const myProfile = defineProfile({
  /* ... */
});

const app = createAgentApp({
  dataDir: "./data",
  profiles: [myProfile],
  summarize: async (messages) => callLLMSummarizer(messages),
});
```

## 默认挂载的路由

| 方法   | 路径             | 说明                          |
| ------ | ---------------- | ----------------------------- |
| `POST` | `/chat`          | 非流式 Agent 调用             |
| `POST` | `/stream`        | 流式 Agent 调用，返回 SSE     |
| `GET`  | `/health`        | 存活探针                      |
| `GET`  | `/ready`         | 就绪探针                      |
| `GET`  | `/__inspector/*` | Inspector API，仅在启用时挂载 |

## 常用选项

### `dataDir`

```ts
dataDir?: string
```

用于保存 Session 与 trace 的目录。当没有传入 `sessionStore` 时，这是必填项。

### `sessionStore`

```ts
sessionStore?: AgentrailSessionStore
```

自定义 Session 存储实现。传入后，Session 存储不再使用默认文件系统实现。

### `profiles`

```ts
profiles?: ProfileDefinition[]
```

静态 Profile 列表。请求体未提供 `agentId` 时，默认使用第一个 Profile。

### `resolveProfile`

```ts
resolveProfile?: ProfileResolver
```

按请求动态选择 Profile。适合租户路由、功能开关或 A/B 测试等情况。

```ts
const app = createAgentApp({
  dataDir: "./data",
  resolveProfile: async ({ agentId, tenantId }) => {
    return await loadProfileForTenant(agentId, tenantId);
  },
  defaultAgentId: "default",
});
```

### `defaultAgentId`

```ts
defaultAgentId?: string
```

请求未携带 `agentId` 时使用的默认 Profile ID。

### `summarize`

```ts
summarize?: (
  messages: Message[],
  ctx?: { reason: "session_compaction" | "reactive_micro" | "reactive_full" },
) => Promise<string>
```

上下文压缩时调用的 summarizer。生产环境中建议始终传入真实的 LLM 总结函数。

### `compaction`

```ts
compaction?: {
  triggerTokens: number;
  minMessages: number;
  reactive?: {
    enabled?: boolean;
    microTriggerPct?: number;
    fullTriggerPct?: number;
    preserveRecentApiRounds?: number;
    microBatchGroups?: number;
    maxReactiveCompactionsPerRequest?: number;
  };
}
```

用于控制自动上下文压缩。

- `triggerTokens`：达到该阈值后触发请求边界压缩
- `minMessages`：至少有这么多消息时才压缩
- `reactive`：控制长轮次中的内联压缩

### `plugins`

```ts
plugins?: AgentrailPlugin[]
```

应用级插件。用于请求拦截、生命周期 hook、上下文注入等 Host 侧扩展。

### `onPluginError`

```ts
onPluginError?: PluginErrorHandler
```

插件 hook 抛错时的统一处理入口。默认行为是输出警告，但不会中断主请求流程。

### `contextProviders`

```ts
contextProviders?: ContextProvider[]
```

应用级上下文提供器。适合添加全局上下文，如当前日期、系统模式或环境标记。

### `sandboxManager`

```ts
sandboxManager?: SandboxManager
```

为 `/stream` 提供上传处理与工作区快照能力。未传入时，接口仍然可用，但沙箱相关功能不会启用。

### `traceStoreFactory`

```ts
traceStoreFactory?: (sessionRef: SessionRef) => SessionTraceStore<WorkflowTraceEventEnvelope>
```

为每个 Session 创建 trace store 的工厂函数。

如果没有显式传入，且配置了 `dataDir`，则会退回到默认文件系统 trace store。

```ts
import { createAgentApp } from "@agentrail/app";
import { PostgresSessionStore, createPostgresSessionTraceStore } from "@agentrail/storage-postgres";

const app = createAgentApp({
  sessionStore: new PostgresSessionStore(sql),
  profiles: [myProfile],
  traceStoreFactory: createPostgresSessionTraceStore(sql),
});
```

### `createOrchestrationPersistence`

```ts
createOrchestrationPersistence?: (sessionRef: SessionRef) => OrchestrationPersistence
```

为每个 Session 创建编排持久层。当传入该选项且未显式提供 `orchestrationRegistry` 时，`createAgentApp` 会自动构建对应的 registry。

### `orchestrationRegistry`

```ts
orchestrationRegistry?: AgentrailOrchestrationRegistry
```

显式传入的编排 registry，用于让 `/stream` 订阅子 Agent 事件。

### `inspector`

```ts
inspector?: true | InspectorDataSource
```

用于挂载只读的 Inspector API。

- `true`：使用文件系统数据源，要求提供 `dataDir`
- `InspectorDataSource`：使用自定义数据源，如 PostgreSQL

### `health`

```ts
health?: {
  readinessChecks?: ReadinessCheck[];
  disableBuiltinHealthRoutes?: boolean;
}
```

控制 `/health` 与 `/ready` 的挂载行为，也可以追加自定义就绪检查。

### `permissionPolicy`

```ts
permissionPolicy?: ToolPermissionPolicy
```

应用到所有 Session 的工具权限策略。启用后，各工具会在执行前走 `checkPermissions`。

常见模式包括：

| `mode`                | 默认结果 | 说明                                                     |
| --------------------- | -------- | -------------------------------------------------------- |
| `"default"`           | `allow`  | 仅对显式列出的 `deny` / `ask` 生效                       |
| `"strict"`            | `deny`   | 默认拒绝，只允许显式列出的操作                           |
| `"acceptEdits"`       | `allow`  | 与 `default` 类似，但 `Write` / `Edit` 的 `ask` 自动通过 |
| `"dontAsk"`           | `allow`  | 与 `default` 类似，但 `ask` 会降级为 `deny`              |
| `"bypassPermissions"` | `allow`  | 跳过所有权限检查，仅适合可信自动化场景                   |

### `telemetrySink`

```ts
telemetrySink?: TelemetrySink
```

用于接收 `/chat` 与 `/stream` 的结构化事件，并转发到 OpenTelemetry、Datadog 或自定义观测后端。

## 返回值

返回一个 `Hono` 实例，可以直接挂到任意支持 `fetch` 风格处理器的运行时：

```ts
import { serve } from "@hono/node-server";
import { createAgentApp } from "@agentrail/app";

const app = createAgentApp({
  /* ... */
});

serve({ fetch: app.fetch, port: 3000 });
```

## 补充说明

这是首批中文版，当前优先覆盖最常用选项。更细的高级选项与完整英文原文仍可继续参考：

- [英文原文 `/reference/create-agent-app`](/reference/create-agent-app)
