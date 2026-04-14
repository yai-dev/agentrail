# 故障排查

本页汇总常见问题及对应处理方式。

## LLM Provider 问题

### `Provider not found` 或 `ProviderNotFoundError`

通常是因为没有注册内建 Provider。需要在任意 agent 代码运行前增加：

```ts
import "@agentrail/core/providers";
```

这会注册 Anthropic 和 OpenAI 两个内建 Provider。

### `401 Unauthorized` 或 `Invalid API Key`

- 检查环境变量是否正确设置，例如 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`
- 检查密钥是否已过期或被吊销
- 如果使用自定义 `baseUrl`，确认对应端点接受当前密钥格式

更多兼容 Provider 的配置方式，可参考 [使用 OpenAI 兼容 Provider](./use-openai-compatible-providers.md)。

### 模型或 Provider 配置错误

`model.provider` 必须与已注册的 Provider 名完全一致：

- `"anthropic"`：Claude 模型
- `"openai"`：GPT 模型及兼容 API

应优先排查拼写错误。报错信息通常会列出当前可用的 Provider。

## Sandbox 问题

### `Cannot connect to Docker daemon`

Sandbox 依赖可运行的 Docker daemon。先确认：

```bash
docker info
```

如果 Docker 未启动，需要先启动再运行服务。

### `Image not found` 或首次启动很慢

Sandbox 镜像需要先拉取或在本地构建：

```bash
# 拉取已发布镜像
docker pull ghcr.io/yai-dev/agentrail-sandbox:latest

# 或本地构建
docker build -t agentrail-sandbox:latest docker/sandbox
```

随后确认配置中的 `sandbox.image` 与实际镜像名一致。

### Sandbox 容器立即退出

先查看容器日志：

```bash
docker logs <container-id>
```

常见原因包括：

- 端口冲突
- 容器内部缺少环境变量
- Docker 可用内存不足

## Session 与存储问题

### Session 损坏，启动时报 parse error

如果 `session.jsonl` 或 `messages.jsonl` 在异常退出后损坏，一般有两种处理方式：

1. 删除该 session
2. 手动修复 JSONL 文件

删除方式是移除 `<dataDir>/tenants/<tenantId>/sessions/<sessionId>/` 对应目录。手动修复时，通常只需要打开 JSONL 文件，找到最后一条不完整记录并删除。

### `Unable to find config/agentrail.yaml`

配置加载器会从当前工作目录向上查找。应确认：

- 服务是在项目根目录启动
- 或已通过 `AGENTRAIL_CONFIG_PATH` 指定绝对路径

## 编排问题

### 子 agent 一直没有响应

先检查 `agentrail.yaml` 中的以下配置：

```yaml
orchestration:
  subagent:
    pollIntervalMs: 500 # 越小轮询越快，但 CPU 更高
    fakeExecution: "" # 为空时才会真实执行
```

如果 `fakeExecution` 被设置为 `"echo"`，子 agent 不会调用 LLM，只会原样回显输入。

### 改完代码后，旧的编排状态仍然被回放

如果编排逻辑已经变化，但管理器在启动时仍然回放旧事件，开发期最直接的处理方式是删除对应 session 目录，重新开始一轮干净会话。

### Wait 条件一直不满足

- 检查目标 `agentIds` 是否正确
- 检查 `kind` 是否匹配：等待任务完成通常用 `"agent-idle"`，等待终止通常用 `"agent-closed"`
- 如果使用 `match: "all"`，则所有列出的 agent 都必须满足条件
- 如果配置了 `timeoutAt`，超时后会以 `timed_out` 状态返回

## 构建与开发问题

### 拉取最新代码后出现 TypeScript 错误

```bash
pnpm install
pnpm build:packages
pnpm typecheck
```

仓库使用 project references。多数类型解析问题可以通过完整重建解决。

### 测试时报 `module not found`

通常是因为运行测试前没有先构建包：

```bash
pnpm build:packages
pnpm test
```

## 仍未解决

如果以上方法仍无帮助，可继续：

1. 搜索 [existing issues](https://github.com/yai-dev/agentrail/issues)
2. 提交 [bug report](https://github.com/yai-dev/agentrail/issues/new?template=bug_report.md)，并附上复现步骤
