# Troubleshooting

Common issues and how to resolve them.

## LLM Provider Errors

### "Provider not found" or `ProviderNotFoundError`

You forgot to register the built-in providers. Add this import before any agent code runs:

```ts
import "@agentrail/core/providers";
```

This registers both the Anthropic and OpenAI providers.

### "401 Unauthorized" or "Invalid API key"

- Check that the correct environment variable is set (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).
- Make sure the key is not expired or revoked.
- If using a custom `baseUrl`, confirm the endpoint accepts your key format.

### Wrong model or provider

The `model.provider` field must match a registered provider name exactly:

- `"anthropic"` — for Claude models
- `"openai"` — for GPT models (and compatible APIs)

Check for typos. The error message will list available providers.

## Sandbox Issues

### "Cannot connect to Docker daemon"

The sandbox requires a running Docker daemon. Verify:

```bash
docker info
```

If Docker is not running, start it before launching the server.

### "Image not found" or slow first start

The sandbox image must be pulled or built locally:

```bash
# Pull the published image
docker pull ghcr.io/yai-dev/agentrail-sandbox:latest

# Or build locally
docker build -t agentrail-sandbox:latest docker/sandbox
```

Then make sure `sandbox.image` in your config matches the image name.

### Sandbox container exits immediately

Check the container logs:

```bash
docker logs <container-id>
```

Common causes:

- Port conflict (another process on the same port)
- Missing environment variables inside the container
- Insufficient memory allocated to Docker

## Session and Storage Issues

### Corrupted session (parse errors on startup)

If `session.jsonl` or `messages.jsonl` is corrupted (e.g. partial write during a crash), you have two options:

1. **Delete the session** — remove the session directory under `<dataDir>/tenants/<tenantId>/sessions/<sessionId>/`
2. **Manual repair** — open the JSONL file, find the malformed line (usually the last one), and remove it

### "Unable to find config/agentrail.yaml"

The config loader searches upward from the current working directory. Make sure you are running the server from the project root, or set the `AGENTRAIL_CONFIG_PATH` environment variable to an absolute path.

## Orchestration Issues

### Sub-agent never responds

Check these settings in `agentrail.yaml`:

```yaml
orchestration:
  subagent:
    pollIntervalMs: 500 # lower = faster polling, higher CPU
    fakeExecution: "" # must be empty for real execution
```

If `fakeExecution` is set to `"echo"`, the sub-agent will echo inputs without calling the LLM.

### Stale orchestration state after code changes

If you changed orchestration logic but the manager replays old events on startup, the state may be inconsistent. For development, delete the session directory to start fresh:

```bash
rm -rf <dataDir>/tenants/<tenantId>/sessions/<sessionId>/
```

### Wait condition never resolves

- Verify the target `agentIds` are correct
- Check `kind`: use `"agent-idle"` to wait for job completion, `"agent-closed"` to wait for termination
- If using `match: "all"`, all listed agents must satisfy the condition
- Check `timeoutAt` if you set one — the wait resolves with `timed_out` status when the deadline passes

## Build and Development Issues

### TypeScript errors after pulling changes

```bash
pnpm install
pnpm build:packages
pnpm typecheck
```

The workspace uses project references. A fresh build resolves most type resolution issues.

### Tests fail with "module not found"

Make sure packages are built before running tests:

```bash
pnpm build:packages && pnpm test
```

## Still Stuck?

If none of the above helps:

1. Search [existing issues](https://github.com/yai-dev/agentrail/issues)
2. Open a [bug report](https://github.com/yai-dev/agentrail/issues/new?template=bug_report.md) with reproduction steps
