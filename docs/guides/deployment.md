# Deployment

This guide covers deploying an Agentrail server to production — from environment variables and Docker setup to logging, security, and horizontal scaling considerations.

## Environment Variables

Never put secrets in config files. Use environment variables for all credentials:

| Variable                | Required            | Purpose                                      |
| ----------------------- | ------------------- | -------------------------------------------- |
| `ANTHROPIC_API_KEY`     | If using Anthropic  | LLM provider API key                         |
| `OPENAI_API_KEY`        | If using OpenAI     | LLM provider API key                         |
| `TAVILY_API_KEY`        | If using web search | Tavily search integration                    |
| `BRAVE_SEARCH_API_KEY`  | If using web search | Brave Search integration                     |
| `JINA_API_KEY`          | If using web search | Jina Search integration                      |
| `AGENTRAIL_DATA_DIR`    | Recommended         | Root data directory for sessions, KB, skills |
| `AGENTRAIL_CONFIG_PATH` | Optional            | Override config file location                |
| `UI_SECRET_TOKEN`       | If UI is public     | Bearer token for `/api/*` routes             |
| `PORT`                  | Optional            | Server port (default: `3000`)                |
| `SANDBOX_IMAGE`         | Optional            | Override sandbox Docker image                |

Non-sensitive settings (timeouts, feature flags, model IDs) can stay in `agentrail.yaml`.

## Docker Compose

A production-ready `docker-compose.yml`:

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
    # Pre-pulls the image so it is ready when first needed.
    command: ["echo", "image ready"]

volumes:
  agentrail-data:
```

## Data Directory

All persistent data lives under `dataDir`:

```
{dataDir}/
  tenants/
    {tenantId}/
      sessions/       # conversation history and compaction archives
      knowledge_bases/ # knowledge base indexes
      users/          # user memory notes
  skills/             # skill packages
```

In production, always mount `dataDir` as a persistent volume. Data written here must survive container restarts.

Set the path via environment variable in your app:

```ts
const dataDir = process.env.AGENTRAIL_DATA_DIR ?? `${process.env.HOME}/.agentrail`;
const sessionStore = new SessionManager(dataDir);
const knowledgeManager = new KnowledgeManager(dataDir);
const sandboxManager = new SandboxManager(dataDir, { image: config.sandbox.image });
```

## Health Check

Add a health endpoint for load balancer and orchestrator probes:

```ts
app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));
```

Use separate liveness and readiness probes if your orchestrator supports them:

- **Liveness**: return `200` if the process is running
- **Readiness**: return `200` only once startup tasks (e.g. image pre-pull) are complete

## Logging

Agentrail does not bundle a logging library. Use the structured logger of your choice and instrument key lifecycle points:

```ts
import { createChatRoute } from "@agentrail/app/advanced";

app.route(
  "/chat",
  createChatRoute({
    // ...
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

Pipe the server's stdout/stderr to your logging infrastructure (CloudWatch, Datadog, GCP Logging, etc.).

## Security

### API Authentication

Protect `/api/*` routes with a Bearer token when the server is publicly accessible:

```ts
app.use("/api/*", async (c, next) => {
  const token = process.env.UI_SECRET_TOKEN;
  if (!token) return next(); // skip auth in dev
  if (c.req.header("Authorization") !== `Bearer ${token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});
```

### CORS

If the API is consumed by a browser from a different origin, configure CORS explicitly:

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

Note: expose `X-Session-Id` so the browser client can read the session ID from stream responses.

### Secrets Rotation

API keys can be rotated without restarting the server if you load them lazily (e.g. from a secrets manager) at request time rather than injecting them into a static `AgentConfig` at startup.

## Sandbox

The sandbox requires Docker. See the Docker Compose section above for the socket mount.

Pin the sandbox image to a specific version tag in production:

```yaml
environment:
  - SANDBOX_IMAGE=ghcr.io/yai-dev/agentrail-sandbox:v1.2.3
```

Set an idle timeout to automatically destroy containers that have been inactive:

```ts
const sandboxManager = new SandboxManager(dataDir, {
  image: process.env.SANDBOX_IMAGE ?? "ghcr.io/yai-dev/agentrail-sandbox:latest",
  idleTimeoutMs: 20 * 60 * 1000, // 20 minutes
});
```

On graceful shutdown, destroy all running containers before exiting:

```ts
async function shutdown() {
  await runPluginLifecycle(plugins, "stop");
  await sandboxManager.destroyAll();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
```

## Horizontal Scaling

The default `SessionManager` writes to the local filesystem, which ties sessions to one server instance. For horizontal scaling:

**Option 1 — Shared filesystem (NFS, EFS, etc.)**

Mount the same `dataDir` path on all instances. This works for moderate scale with a small number of instances.

**Option 2 — Custom `AgentrailSessionStore`**

Implement `AgentrailSessionStore` backed by a database (PostgreSQL, Redis, etc.) and pass it to your route factories. The interface is designed so this swap requires no changes to route or profile code.

See [Configure Sessions](configure-sessions.md) for the custom store implementation guide.

**Note:** The sandbox creates Docker containers on the local host and cannot be shared across instances directly. For multi-instance deployments with sandbox support, consider routing requests for the same session to the same instance (sticky sessions at the load balancer), or using a remote Docker daemon.

## Production Checklist

- [ ] API keys are set via environment variables, not in config files
- [ ] `AGENTRAIL_DATA_DIR` points to a persistent volume
- [ ] Docker socket is mounted for sandbox operations
- [ ] `SANDBOX_IMAGE` pins a specific version tag (not `latest`)
- [ ] `UI_SECRET_TOKEN` is set if the server is publicly accessible
- [ ] CORS is configured with an explicit `origin`
- [ ] A `/health` endpoint is registered
- [ ] Graceful shutdown destroys sandbox containers
- [ ] Log output is captured by your logging infrastructure
- [ ] Idle sandbox timeout is tuned for your workload
- [ ] Session storage strategy is chosen for your scaling requirements

## Related Guides

- [Configure Sessions](configure-sessions.md)
- [Use Capability Packages](use-capability-packages.md)
- [Troubleshooting](troubleshooting.md)
