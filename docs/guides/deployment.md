# Deployment

This guide shows a minimal path for deploying an Agentrail server to production.

## Environment Variables

In production, use environment variables instead of `agentrail.yaml` for secrets:

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes (if using Anthropic) | LLM provider API key |
| `OPENAI_API_KEY` | Yes (if using OpenAI) | LLM provider API key |
| `TAVILY_API_KEY` | If using search | Tavily search integration |
| `AGENTRAIL_CONFIG_PATH` | Optional | Override config file location |

Non-sensitive settings (ports, timeouts, feature flags) can remain in `agentrail.yaml`.

## Docker Compose Example

A minimal `docker-compose.yml` for running the playground server with a sandbox:

```yaml
version: "3.8"

services:
  server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - AGENTRAIL_CONFIG_PATH=/app/config/agentrail.yaml
    volumes:
      - agentrail-data:/data
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - sandbox

  sandbox:
    image: ghcr.io/yai-dev/agentrail-sandbox:latest
    # The sandbox container is managed by the server at runtime.
    # This entry pre-pulls the image so it is available immediately.
    command: ["echo", "image ready"]

volumes:
  agentrail-data:
```

Adjust the `build` context and `AGENTRAIL_CONFIG_PATH` to match your project layout.

## Data Directory

Session data, compaction archives, and user memory are stored under the `paths.dataDir` setting (default: `~/.agentrail`).

In production, mount this as a persistent volume:

```yaml
volumes:
  - agentrail-data:/data
```

And set `paths.dataDir` in your config to `/data`.

## Docker Socket Access

The sandbox manager needs access to the Docker daemon to create and manage sandbox containers. Mount the Docker socket:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

On hosts where mounting the socket is not an option (e.g. some managed container platforms), you can use Docker-in-Docker or a remote Docker daemon.

## Health Check

Agentrail does not currently expose a built-in health endpoint. Add one in your app:

```ts
app.get("/health", (c) => c.json({ status: "ok" }));
```

Use this for container orchestrator liveness and readiness probes.

## Production Checklist

- [ ] API keys are set via environment variables, not in config files
- [ ] `paths.dataDir` points to a persistent volume
- [ ] Docker socket is accessible for sandbox operations
- [ ] `sandbox.image` points to a pinned version tag (not `latest`)
- [ ] `auth.uiSecretToken` is set if the UI is exposed publicly
- [ ] A health endpoint is available for load balancer probes
- [ ] Log output is captured by your logging infrastructure

## Limitations

The current storage layer is filesystem-based. For horizontal scaling across multiple server instances, you would need a shared filesystem or a custom `AgentrailSessionStore` implementation backed by a database. See the [Roadmap](/roadmap) for planned improvements.
