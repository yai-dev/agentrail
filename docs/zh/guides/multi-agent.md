# 多 Agent 编排

当一个托管 Agent 需要把工作委派给受管的 Sub-Agents 时，应使用 `@agentrail/capabilities` 中的编排能力。

## 适用时机

建议在读完以下内容后阅读本页：

- [快速开始](./quickstart.md)
- [Events（英文）](../../concepts/events.md)
- [Host 原语](../reference/host-primitives.md)

## 什么时候需要编排

在以下情况中，编排是合理选择：

- 单个 Agent 无法独立完成整个任务
- 工作可并行拆分给多个 Sub-Agents
- 需要结构化的等待与完成语义
- 需要在进程重启后恢复状态

如果只是一个带工具的单 Agent，通常不需要编排。

## 五步模式

### 1. 创建 `OrchestrationManager`

`OrchestrationManager` 持有一次运行的完整状态。通常按 Session 创建，并把状态持久化到 Session 目录：

```ts
import { OrchestrationManager } from "@agentrail/capabilities";

const manager = await OrchestrationManager.create({
  sessionDir: "/path/to/session",
  runtime: agentFactory,
});
```

其中 `runtime` 是 `OrchestrationAgentFactory`，负责按不同角色创建受管 Agent。

### 2. 启动一次运行

每次编排都从一次运行和一个初始任务开始：

```ts
await manager.startRun({
  runId: "run-1",
  initialTask: {
    id: "task-1",
    kind: "research",
    input: { query: "Explain quantum computing" },
  },
});
```

### 3. 创建 Sub-Agent 并发送工作

```ts
const worker = await manager.spawnAgent({
  id: "worker-1",
  role: "researcher",
});

await manager.sendInput({
  id: "input-1",
  agentId: "worker-1",
  payload: { instruction: "Research the basics of quantum computing" },
});
```

每个 Sub-Agent 都有自己的 Mailbox。输入会按顺序排队，管理器会自动跟踪任务开始与结束。

### 4. 等待结果

```ts
const result = await manager.waitForAgents({
  id: "wait-1",
  agentId: "worker-1",
  kind: "agent-idle",
  description: "Wait for researcher to finish",
});
```

如果要等待多个 Agent，可使用 `match: "all"` 或 `match: "any"`：

```ts
await manager.waitForAgents({
  id: "wait-all",
  agentId: "worker-1",
  agentIds: ["worker-1", "worker-2", "worker-3"],
  kind: "agent-idle",
  description: "Wait for all researchers",
  match: "all",
});
```

也可以通过 `timeoutAt` 限制等待时间。

### 5. 关闭 Agent 并结束运行

```ts
await manager.closeAgent({ id: "close-1", agentId: "worker-1" });
await manager.completeRun({ status: "completed" });
```

## 从 Agent 侧看是什么样

在典型托管场景中，父 Agent 不会直接调用 `OrchestrationManager`。应用层会在 Profile 中加入 `orchestration` Capability，然后把管理动作暴露为 Tool：

```ts
import { defineProfile } from "@agentrail/app";
import { orchestration } from "@agentrail/capabilities";

export const orchestratorProfile = defineProfile({
  id: "orchestrator",
  name: "Orchestrator",
  agent: {
    model: "anthropic:claude-sonnet-4-5",
    prompt: "You are an orchestrator that coordinates sub-agents.",
  },
  capabilities: [orchestration(orchestrationRegistry, subAgentFactory)],
});
```

可用工具包括：

| Tool          | 作用                       |
| ------------- | -------------------------- |
| `spawn-agent` | 创建一个带角色的 Sub-Agent |
| `send-input`  | 向 Sub-Agent 发送工作项    |
| `wait-agent`  | 等待 Agent 满足某个条件    |
| `close-agent` | 关闭 Sub-Agent             |

父 Agent 与使用普通 Tool 的方式完全一致。Host 层会在底层把这些 Tool 调用映射成 `OrchestrationManager` 方法调用。

## 状态与恢复

所有编排事件都会以追加式 Event Log 写入磁盘。启动时，`OrchestrationManager.create()` 会回放这份日志，并重建完整内存状态。

这意味着：

- Sub-Agent 状态能在进程重启后恢复
- 排队输入会在恢复后重新投递
- 未完成的等待条件会重新计算

## 订阅事件

可以通过 `manager.subscribe()` 实时观察编排状态变化：

```ts
const unsubscribe = manager.subscribe(({ event, snapshot }) => {
  console.log(event.type, snapshot.run?.status);
});
```

Host 层正是利用这一点把编排事件转发到 UI 的 SSE 流中。

## 仓库示例

当前仓库里，多 Agent 编排的主要示例是 Deep Research：

- [Deep Research 示例（英文）](../../examples/deep-research.md)

## 相关文档

- [事件](../reference/events.md)
- [Host 原语](../reference/host-primitives.md)
- [英文原文](../../guides/multi-agent.md)
