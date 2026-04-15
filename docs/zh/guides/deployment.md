# 部署

本页说明如何把 Agentrail 服务部署到生产环境，覆盖环境变量、Docker、日志、安全与横向扩展等问题。

## 环境变量

不要把密钥写进配置文件。所有凭据都应通过环境变量提供：

| 变量                    | 何时需要           | 用途                             |
| ----------------------- | ------------------ | -------------------------------- |
| `ANTHROPIC_API_KEY`     | 使用 Anthropic 时  | LLM Provider API Key             |
| `OPENAI_API_KEY`        | 使用 OpenAI 时     | LLM Provider API Key             |
| `TAVILY_API_KEY`        | 使用 Web Search 时 | Tavily Search                    |
| `BRAVE_SEARCH_API_KEY`  | 使用 Web Search 时 | Brave Search                     |
| `JINA_API_KEY`          | 使用 Web Search 时 | Jina Search                      |
| `EXA_API_KEY`           | 使用 Web Search 时 | Exa Search                       |
| `AGENTRAIL_DATA_DIR`    | 推荐配置           | Session、知识库、Skills 的根目录 |
| `AGENTRAIL_CONFIG_PATH` | 可选               | 覆盖配置文件位置                 |
| `UI_SECRET_TOKEN`       | UI 对公网开放时    | `/api/*` 路由的 Bearer Token     |
| `PORT`                  | 可选               | 服务端口，默认 `3000`            |
| `SANDBOX_IMAGE`         | 可选               | 覆盖 Sandbox Docker 镜像         |

非敏感配置，例如超时、功能开关和模型 ID，可继续放在 `agentrail.yaml` 中。

## Docker Compose

一个适合生产环境的 `docker-compose.yml` 示例：

```yaml
version: "3.8"

services:
  server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - AGENTRAIL_DATA_DIR=/data/agentrail
      - AGENTRAIL_CONFIG_PATH=/app/config/agentrail.yaml
      - UI_SECRET_TOKEN=${UI_SECRET_TOKEN}
    volumes:
      - agentrail-data:/data/agentrail
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  sandbox:
    image: ghcr.io/yai-dev/agentrail-sandbox:latest
    command: ["echo", "image ready"]

volumes:
  agentrail-data:
```

## `dataDir`

所有持久化数据都位于 `dataDir` 下：

```text
{dataDir}/
  tenants/
    {tenantId}/
      sessions/
      knowledge_bases/
      users/
  skills/
```

在生产环境中，应始终把 `dataDir` 挂到持久化卷，确保容器重启后数据不丢失。

在应用中可通过环境变量传入：

```ts
const dataDir = process.env.AGENTRAIL_DATA_DIR ?? `${process.env.HOME}/.agentrail`;
const sessionStore = new SessionManager(dataDir);
const knowledgeManager = new KnowledgeManager(dataDir);
const sandboxManager = new SandboxManager(dataDir, { image: config.sandbox.image });
```

## 健康检查

建议为负载均衡器和编排系统提供健康检查接口：

```ts
app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));
```

如果部署平台支持，最好区分：

- Liveness：进程活着就返回 `200`
- Readiness：只有启动任务完成后才返回 `200`

## 日志

Agentrail 不内置日志库。建议接入当前团队已有的结构化日志方案，并在关键生命周期上加日志：

```ts
import { createChatRoute } from "@agentrail/app/advanced";

app.route(
  "/chat",
  createChatRoute({
    plugins: [
      {
        name: "request-logger",
        onRequestStart(ctx) {
          console.log(
            JSON.stringify({
              level: "info",
              event: "request_start",
              kind: ctx.kind,
              agentId: ctx.agentId,
              sessionId: ctx.sessionId,
              tenantId: ctx.tenantId,
            }),
          );
        },
        onRequestEnd(ctx) {
          console.log(
            JSON.stringify({
              level: "info",
              event: "request_end",
              sessionId: ctx.sessionId,
            }),
          );
        },
      },
    ],
  }),
);
```

随后把服务的 `stdout` / `stderr` 交给现有日志系统，例如 CloudWatch、Datadog 或 GCP Logging。

## 安全

### API 认证

当服务对公网开放时，应使用 Bearer Token 保护 `/api/*` 路由：

```ts
app.use("/api/*", async (c, next) => {
  const token = process.env.UI_SECRET_TOKEN;
  if (!token) return next();
  if (c.req.header("Authorization") !== `Bearer ${token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});
```

### CORS

如果浏览器从不同来源访问 API，应显式配置 CORS：

```ts
import { cors } from "hono/cors";

app.use(
  "/api/*",
  cors({
    origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
    allowMethods: ["GET", "POST", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-Session-Id"],
  }),
);
```

这里需要暴露 `X-Session-Id`，否则浏览器无法读取流式响应返回的 Session ID。

### 密钥轮换

如果 API Keys 需要动态轮换，建议在请求时惰性读取，而不是在启动期写死到静态 `AgentConfig` 中。

## Sandbox

Sandbox 依赖 Docker。部署时需要确保：

- 已挂载 Docker Socket
- 生产环境固定使用明确的镜像版本，而不是 `latest`

例如：

```yaml
environment:
  - SANDBOX_IMAGE=ghcr.io/yai-dev/agentrail-sandbox:v1.2.3
```

还应设置合理的空闲超时，以便回收长时间未使用的容器：

```ts
const sandboxManager = new SandboxManager(dataDir, {
  image: process.env.SANDBOX_IMAGE ?? "ghcr.io/yai-dev/agentrail-sandbox:latest",
  idleTimeoutMs: 20 * 60 * 1000,
});
```

在优雅退出流程中，应先停止插件，再销毁 Sandbox 容器：

```ts
async function shutdown() {
  await runPluginLifecycle(plugins, "stop");
  await sandboxManager.destroyAll();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
```

## 横向扩展

默认的 `SessionManager` 写入本地文件系统，因此 Session 天然绑定到单个服务实例。

常见方案有两类：

### 共享文件系统

把同一个 `dataDir` 挂载到所有实例，例如 NFS、EFS。

### 自定义 `AgentrailSessionStore`

通过数据库或其他共享存储实现 `AgentrailSessionStore`，再传给 `createAgentApp`。

需要注意的是，Sandbox 容器运行在本机，不能直接在多个实例之间共享。如果多实例部署同时启用了 Sandbox，通常需要：

- 对同一 Session 使用 Sticky Session
- 或使用远程 Docker Daemon

## 生产检查清单

- [ ] API Keys 全部来自环境变量，而不是配置文件
- [ ] `AGENTRAIL_DATA_DIR` 指向持久化卷
- [ ] 已挂载 Docker Socket
- [ ] `SANDBOX_IMAGE` 固定到具体版本
- [ ] 若服务对公网开放，已设置 `UI_SECRET_TOKEN`
- [ ] CORS 使用显式 `origin`
- [ ] 已注册 `/health`
- [ ] 优雅退出时会销毁 Sandbox 容器
- [ ] 日志已接入现有日志系统
- [ ] Sandbox 空闲超时已按负载调优
- [ ] Session 存储方案已与扩展方式匹配

## 相关文档

- [配置 Session](./configure-sessions.md)
- [使用能力包](./use-capability-packages.md)
- [故障排查](./troubleshooting.md)
- [英文原文](../../guides/deployment.md)
