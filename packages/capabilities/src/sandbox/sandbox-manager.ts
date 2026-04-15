/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import Docker from "dockerode";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import tar from "tar-stream";

// ============================================================================
// ============================================================================

/** Default Docker image used for per-session sandboxes. */
export const SANDBOX_IMAGE =
  process.env.SANDBOX_IMAGE ?? "ghcr.io/yai-dev/agentrail-sandbox:latest";
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB

// ============================================================================
// ============================================================================

/**
 * Provider that gives `SandboxManager` bidirectional access to memo documents
 * and tool-result artifacts stored in any backend (filesystem or database).
 *
 * When set on `SandboxManagerOptions.memoProvider`:
 * - **Read path**: memo documents are snapshotted into a temporary host
 *   directory at sandbox creation time so that `/workspace/memo/**` paths are
 *   always populated inside the container.
 * - **Write path**: writes made via the sandboxed `Write` / `Edit` tools to
 *   memo paths are propagated back to the underlying store so the backing
 *   store stays consistent with what the agent sees in the sandbox.
 *
 * `SessionManager` from `@agentrail/app` implements all methods of this
 * interface and can be passed directly.
 */
export interface SandboxMemoProvider {
  // ── Read ──────────────────────────────────────────────────────────────────

  /** Reads a named memo document. Returns `null` when absent. */
  readMemoryDocument(
    tenantId: string,
    ownerId: string,
    scope: "session" | "user",
    name: string,
  ): Promise<string | null>;

  /**
   * Returns all tool-call IDs whose compacted artifacts are stored in this
   * session. Used to pre-populate `/workspace/memo/session/tool-results/`
   * inside the container at creation time.
   *
   * Optional — when absent, tool-result artifacts are not snapshotted and
   * `/workspace/memo/session/tool-results/` will be empty inside the sandbox.
   */
  listToolResultArtifactIds?(sessionRef: string): Promise<string[]>;

  /**
   * Reads a compacted tool-result artifact by tool call ID.
   * Required when `listToolResultArtifactIds` is implemented.
   */
  readToolResultArtifact?(sessionRef: string, toolCallId: string): Promise<string | null>;

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Persists a memo document back to the underlying store after the agent
   * modifies it via the sandboxed `Write` or `Edit` tool.
   *
   * Optional — when absent, writes to memo paths only update the local temp
   * directory and are not propagated to the backing store.
   */
  writeMemoryDocument?(
    tenantId: string,
    ownerId: string,
    scope: "session" | "user",
    name: string,
    content: string,
  ): Promise<void>;

  /**
   * Persists a compacted tool-result artifact back to the underlying store
   * after the agent writes to `/workspace/memo/session/tool-results/<id>.txt`.
   *
   * Optional — when absent, such writes are not propagated to the store.
   */
  writeToolResultArtifact?(sessionRef: string, toolCallId: string, content: string): Promise<void>;
}

/** Active sandbox record for one session. */
export interface SandboxEntry {
  containerId: string;
  browserPort: number;
  workspaceDir: string;
  memoSessionDir: string;
  memoUserDir: string;
  /** Stored so write-back methods can call the correct store APIs. */
  tenantId: string;
  userId: string;
  sessionId: string;
  /**
   * When a `memoProvider` is used, memo docs are snapshotted here before
   * container creation so they can be bind-mounted. Cleaned up on destroy.
   */
  tempMemoBase?: string;
}

/** Execution options for one `docker exec` call. */
export interface RunOptions {
  timeout?: number;
  workingDir?: string;
  signal?: AbortSignal;
}

/** Result of a command executed inside the sandbox. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/** Result of a background shell command launched inside the sandbox. */
export interface BackgroundExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  pid: number;
  timedOut: boolean;
}

/** Optional overrides for sandbox lifecycle behavior. */
export interface SandboxManagerOptions {
  image?: string;
  idleTimeoutMs?: number;
  docker?: Docker;
  /**
   * Provider used to snapshot memo documents into the sandbox at creation time.
   *
   * When set, the manager fetches session and user memo files (`NOTES.md`,
   * `TODO.md`, `USER.md`) from the provider before starting the container and
   * writes them to a temporary host directory that is bind-mounted at
   * `/workspace/memo/session` and `/workspace/memo/user` inside the container.
   *
   * This ensures `/workspace/memo/**` paths are populated even when the host
   * uses a database-backed session store that does not write files to disk.
   *
   * The snapshot is taken once at sandbox creation. Updates to memo documents
   * while the sandbox is running are not automatically reflected (the container
   * must be restarted to pick up changes).
   *
   * Pass your session store directly — `SessionManager` implements the required
   * `readMemoryDocument` method, as will any custom `AgentrailSessionStore`.
   */
  memoProvider?: SandboxMemoProvider;
}

// ============================================================================
// ============================================================================

function truncate(s: string, max: number): string {
  if (Buffer.byteLength(s, "utf-8") <= max) return s;
  return Buffer.from(s, "utf-8").subarray(0, max).toString("utf-8") + "\n[output truncated]";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Sandbox browser-server health check timed out after ${timeoutMs}ms`);
}

// ============================================================================
// SandboxManager
// ============================================================================

/**
 * Manages one Docker-backed isolated sandbox per session.
 *
 * ## Memo path semantics (`/workspace/memo/**`)
 *
 * The manager bind-mounts two directories into every container:
 *
 * - `/workspace/memo/session` — session-scoped memo files (`NOTES.md`, `TODO.md`)
 * - `/workspace/memo/user`    — user-scoped memo files (`USER.md`)
 *
 * **Filesystem backend** (`SessionManager` / default): the real
 * `<dataDir>/tenants/...` directories are mounted directly.
 *
 * **Database/custom backend**: pass a `memoProvider` in `SandboxManagerOptions`.
 * The manager will snapshot memo documents from the provider into a temporary
 * host directory before starting the container and bind-mount that directory.
 * The snapshot is taken once at sandbox creation; updates while the container
 * is running are not automatically reflected.
 *
 * Without a `memoProvider`, `/workspace/memo/**` will be empty for non-filesystem
 * backends.
 *
 * @see {@link https://agentrail.run/guides/use-capability-packages}
 */
export class SandboxManager {
  private readonly docker: Docker;
  private readonly sandboxes = new Map<string, SandboxEntry>();
  private readonly pending = new Map<string, Promise<SandboxEntry>>();
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly image: string;
  private readonly idleTimeoutMs: number;
  private readonly memoProvider: SandboxMemoProvider | undefined;

  constructor(
    private readonly dataDir: string,
    options: SandboxManagerOptions = {},
  ) {
    this.docker = options.docker ?? new Docker();
    this.image = options.image ?? SANDBOX_IMAGE;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.memoProvider = options.memoProvider;
  }

  async ensureSandbox(sessionId: string, tenantId: string, userId: string): Promise<SandboxEntry> {
    const existing = this.sandboxes.get(sessionId);
    if (existing) {
      this.resetIdleTimer(sessionId);
      return existing;
    }

    if (!this.pending.has(sessionId)) {
      const p = this._createSandbox(sessionId, tenantId, userId)
        .then((entry) => {
          this.sandboxes.set(sessionId, entry);
          this.pending.delete(sessionId);
          this.resetIdleTimer(sessionId);
          return entry;
        })
        .catch((err: unknown) => {
          this.pending.delete(sessionId);
          throw err;
        });
      this.pending.set(sessionId, p);
    }

    return this.pending.get(sessionId)!;
  }

  private async _createSandbox(
    sessionId: string,
    tenantId: string,
    userId: string,
  ): Promise<SandboxEntry> {
    const workspaceDir = path.join(this.dataDir, "sandboxes", sessionId);
    const skillsDir = path.join(this.dataDir, "skills");

    // ── Memo directories ────────────────────────────────────────────────────
    //
    // When a memoProvider is configured (database-backed stores), snapshot memo
    // documents to a temporary host directory before container creation so they
    // can be bind-mounted. The temp dir is stored in the SandboxEntry and
    // cleaned up on destroySandbox().
    //
    // Without a memoProvider the legacy behaviour is preserved: the real
    // dataDir/tenants/... directories are bind-mounted directly.
    let memoSessionDir: string;
    let memoUserDir: string;
    let tempMemoBase: string | undefined;

    if (this.memoProvider) {
      tempMemoBase = await mkdtemp(path.join(os.tmpdir(), `agentrail-memo-${sessionId}-`));
      memoSessionDir = path.join(tempMemoBase, "session");
      memoUserDir = path.join(tempMemoBase, "user");
      const toolResultsDir = path.join(memoSessionDir, "tool-results");
      await Promise.all([
        mkdir(memoSessionDir, { recursive: true }),
        mkdir(memoUserDir, { recursive: true }),
        mkdir(toolResultsDir, { recursive: true }),
      ]);

      // Build the session reference used for artifact lookups.
      // Follows the same convention as resolveSessionRef in other modules.
      const sessionRef = `${tenantId}:${sessionId}`;

      // Snapshot known memo files and tool-result artifacts in parallel.
      const snapshotTasks: Promise<void>[] = [
        this._snapshotMemoDoc(
          this.memoProvider,
          tenantId,
          sessionId,
          "session",
          "NOTES.md",
          memoSessionDir,
        ),
        this._snapshotMemoDoc(
          this.memoProvider,
          tenantId,
          sessionId,
          "session",
          "TODO.md",
          memoSessionDir,
        ),
        this._snapshotMemoDoc(this.memoProvider, tenantId, userId, "user", "USER.md", memoUserDir),
      ];

      if (this.memoProvider.listToolResultArtifactIds && this.memoProvider.readToolResultArtifact) {
        const { listToolResultArtifactIds, readToolResultArtifact } = this.memoProvider;
        snapshotTasks.push(
          this._snapshotToolResultArtifacts(
            { listToolResultArtifactIds, readToolResultArtifact },
            sessionRef,
            toolResultsDir,
          ),
        );
      }

      await Promise.all(snapshotTasks);
    } else {
      memoSessionDir = path.join(this.dataDir, "tenants", tenantId, "sessions", sessionId);
      memoUserDir = path.join(this.dataDir, "tenants", tenantId, "users", userId);
      await Promise.all([
        mkdir(memoSessionDir, { recursive: true }),
        mkdir(memoUserDir, { recursive: true }),
      ]);
    }

    await Promise.all([
      mkdir(workspaceDir, { recursive: true }),
      mkdir(skillsDir, { recursive: true }),
    ]);

    const browserPort = await findAvailablePort();
    const containerName = `sandbox-${sessionId}`;

    try {
      await this.docker.getContainer(containerName).remove({ force: true });
    } catch {
      // no stale container
    }

    const container = await this.docker.createContainer({
      Image: this.image,
      name: containerName,
      Cmd: ["sleep", "infinity"],
      HostConfig: {
        Memory: 1024 * 1024 * 1024,
        CpuQuota: 100_000,
        Binds: [
          `${workspaceDir}:/workspace`,
          `${memoSessionDir}:/workspace/memo/session:ro`,
          `${memoUserDir}:/workspace/memo/user:ro`,
          `${skillsDir}:/skills:ro`,
        ],
        PortBindings: {
          "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: String(browserPort) }],
        },
      },
      ExposedPorts: { "8080/tcp": {} },
    });

    await container.start();

    await this.runDetachedCommand(containerName, ["node", "/opt/browser-server/index.js"]);

    await waitForHealth(`http://127.0.0.1:${browserPort}/health`, 20_000);

    console.log(
      `[sandbox] Container ready for session ${sessionId} (browser port: ${browserPort})`,
    );

    return {
      containerId: container.id,
      browserPort,
      workspaceDir,
      memoSessionDir,
      memoUserDir,
      tenantId,
      userId,
      sessionId,
      ...(tempMemoBase ? { tempMemoBase } : {}),
    };
  }

  /** Fetches one memo document from the provider and writes it to `targetDir`. */
  private async _snapshotMemoDoc(
    provider: SandboxMemoProvider,
    tenantId: string,
    ownerId: string,
    scope: "session" | "user",
    name: string,
    targetDir: string,
  ): Promise<void> {
    try {
      const content = await provider.readMemoryDocument(tenantId, ownerId, scope, name);
      if (content !== null && content !== "") {
        await writeFile(path.join(targetDir, name), content, "utf8");
      }
    } catch {
      // Non-fatal: if the store fails to read a memo doc, the sandbox starts
      // without it rather than blocking sandbox creation entirely.
    }
  }

  /**
   * Fetches all tool-result artifacts for `sessionRef` from the provider and
   * writes each one to `toolResultsDir/<toolCallId>.txt`.
   */
  private async _snapshotToolResultArtifacts(
    provider: Required<
      Pick<SandboxMemoProvider, "listToolResultArtifactIds" | "readToolResultArtifact">
    >,
    sessionRef: string,
    toolResultsDir: string,
  ): Promise<void> {
    try {
      const ids = await provider.listToolResultArtifactIds(sessionRef);
      await Promise.all(
        ids.map(async (id) => {
          try {
            const content = await provider.readToolResultArtifact(sessionRef, id);
            if (content !== null) {
              await writeFile(path.join(toolResultsDir, `${id}.txt`), content, "utf8");
            }
          } catch {
            // Non-fatal: skip individual artifacts that fail to load.
          }
        }),
      );
    } catch {
      // Non-fatal: if listing fails the sandbox starts without pre-populated artifacts.
    }
  }

  async runInSandbox(sessionId: string, cmd: string[], opts: RunOptions = {}): Promise<ExecResult> {
    const entry = this.sandboxes.get(sessionId);
    if (!entry) throw new Error(`No sandbox found for session '${sessionId}'`);
    this.resetIdleTimer(sessionId);

    const containerName = `sandbox-${sessionId}`;
    const workDir = opts.workingDir ?? "/workspace";
    const timeoutMs = opts.timeout ?? 60_000;
    const pidFile = `/tmp/agentrail-exec-${randomUUID()}.pid`;
    const wrappedCmd = [
      "/bin/sh",
      "-lc",
      'pid_file="$1"; shift; printf "%s" "$$" > "$pid_file"; exec "$@"',
      "sh",
      pidFile,
      ...cmd,
    ];
    const activeExec = await this.startAttachedCommand(containerName, wrappedCmd, {
      workingDir: workDir,
    });

    let timedOut = false;
    let aborted = false;
    let terminationPromise: Promise<void> | null = null;

    const terminate = (reason: "timeout" | "abort") => {
      if (terminationPromise) {
        return;
      }
      timedOut = reason === "timeout";
      aborted = reason === "abort";
      terminationPromise = this.terminateCommand(containerName, pidFile).catch(() => undefined);
    };

    const timer = setTimeout(() => {
      terminate("timeout");
    }, timeoutMs);
    timer.unref?.();

    const abortHandler = () => {
      terminate("abort");
    };
    opts.signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      await activeExec.closed;
      await terminationPromise;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", abortHandler);
    }

    const inspected = await activeExec.exec.inspect();
    const stdout = truncate(
      Buffer.concat(activeExec.stdoutChunks).toString("utf-8"),
      MAX_OUTPUT_BYTES,
    );
    const stderr = truncate(
      Buffer.concat(activeExec.stderrChunks).toString("utf-8"),
      MAX_OUTPUT_BYTES,
    );

    if (aborted) {
      throw new Error("Sandbox command aborted");
    }

    return {
      stdout,
      stderr,
      exitCode: inspected.ExitCode ?? 0,
      timedOut,
    };
  }

  async runBackgroundShellCommand(
    sessionId: string,
    command: string,
    opts: RunOptions = {},
  ): Promise<BackgroundExecResult> {
    const entry = this.sandboxes.get(sessionId);
    if (!entry) throw new Error(`No sandbox found for session '${sessionId}'`);
    this.resetIdleTimer(sessionId);

    const containerName = `sandbox-${sessionId}`;
    const workDir = opts.workingDir ?? "/workspace";
    const timeoutMs = opts.timeout ?? 30_000;
    const execId = randomUUID();
    const stdoutFile = `/tmp/agentrail-bash-${execId}.stdout`;
    const stderrFile = `/tmp/agentrail-bash-${execId}.stderr`;
    const statusFile = `/tmp/agentrail-bash-${execId}.status`;
    const pidFile = `/tmp/agentrail-bash-${execId}.pid`;

    const launcher = [
      "/bin/sh",
      "-lc",
      'stdout_file="$1"; stderr_file="$2"; status_file="$3"; pid_file="$4"; work_dir="$5"; : > "$stdout_file"; : > "$stderr_file"; rm -f "$status_file" "$pid_file"; nohup /bin/sh -lc \'cd "$1" && /bin/sh -lc "$2"; status=$?; printf "%s" "$status" > "$3"\' sh "$work_dir" "$AGENTRAIL_BASH_COMMAND" "$status_file" > "$stdout_file" 2> "$stderr_file" < /dev/null & printf "%s" "$!" > "$pid_file"',
      "sh",
      stdoutFile,
      stderrFile,
      statusFile,
      pidFile,
      workDir,
    ];
    const launchResult = await this.runCommand(containerName, launcher, {
      env: [`AGENTRAIL_BASH_COMMAND=${command}`],
    });
    if (launchResult.exitCode !== 0) {
      throw new Error(launchResult.stderr || "Failed to start background command");
    }

    const pidValue = await this.readContainerFileIfPresent(containerName, pidFile);
    const pid = Number(pidValue?.trim() ?? "0");
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new Error("Sandbox background command did not report a pid");
    }

    const deadline = Date.now() + timeoutMs;
    while (timeoutMs > 0 && Date.now() < deadline) {
      if (opts.signal?.aborted) {
        throw new Error("Sandbox command aborted");
      }

      const status = await this.readContainerFileIfPresent(containerName, statusFile);
      if (status !== null && status.trim() !== "") {
        return {
          stdout: (await this.readContainerFileIfPresent(containerName, stdoutFile)) ?? "",
          stderr: (await this.readContainerFileIfPresent(containerName, stderrFile)) ?? "",
          exitCode: Number(status.trim()),
          pid,
          timedOut: false,
        };
      }

      await sleep(100);
    }

    if (opts.signal?.aborted) {
      throw new Error("Sandbox command aborted");
    }

    return {
      stdout: (await this.readContainerFileIfPresent(containerName, stdoutFile)) ?? "",
      stderr: (await this.readContainerFileIfPresent(containerName, stderrFile)) ?? "",
      exitCode: null,
      pid,
      timedOut: true,
    };
  }

  private async startAttachedCommand(
    containerName: string,
    cmd: string[],
    opts: {
      workingDir?: string;
      env?: string[];
    } = {},
  ): Promise<{
    exec: Docker.Exec;
    stdoutChunks: Buffer[];
    stderrChunks: Buffer[];
    closed: Promise<void>;
  }> {
    const container = this.docker.getContainer(containerName);
    const exec = await container.exec({
      Cmd: cmd,
      WorkingDir: opts.workingDir,
      AttachStdout: true,
      AttachStderr: true,
      ...(opts.env ? { Env: opts.env } : {}),
    });
    const execStream = await exec.start({ hijack: true, stdin: false });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdoutPT = new PassThrough();
    const stderrPT = new PassThrough();
    stdoutPT.on("data", (c: Buffer) => stdoutChunks.push(c));
    stderrPT.on("data", (c: Buffer) => stderrChunks.push(c));
    this.docker.modem.demuxStream(execStream, stdoutPT, stderrPT);
    return {
      exec,
      stdoutChunks,
      stderrChunks,
      closed: new Promise<void>((resolve, reject) => {
        execStream.on("close", resolve);
        execStream.on("error", reject);
      }),
    };
  }

  private async runCommand(
    containerName: string,
    cmd: string[],
    opts: {
      workingDir?: string;
      env?: string[];
    } = {},
  ): Promise<ExecResult> {
    const activeExec = await this.startAttachedCommand(containerName, cmd, opts);
    await activeExec.closed;
    const inspected = await activeExec.exec.inspect();
    return {
      stdout: truncate(Buffer.concat(activeExec.stdoutChunks).toString("utf-8"), MAX_OUTPUT_BYTES),
      stderr: truncate(Buffer.concat(activeExec.stderrChunks).toString("utf-8"), MAX_OUTPUT_BYTES),
      exitCode: inspected.ExitCode ?? 0,
      timedOut: false,
    };
  }

  private async runDetachedCommand(
    containerName: string,
    cmd: string[],
    opts: {
      workingDir?: string;
      env?: string[];
    } = {},
  ): Promise<void> {
    const container = this.docker.getContainer(containerName);
    const exec = await container.exec({
      Cmd: cmd,
      WorkingDir: opts.workingDir,
      AttachStdout: false,
      AttachStderr: false,
      ...(opts.env ? { Env: opts.env } : {}),
    });
    await exec.start({ Detach: true });
  }

  private async readContainerFileIfPresent(
    containerName: string,
    containerPath: string,
  ): Promise<string | null> {
    const result = await this.runCommand(containerName, [
      "/bin/sh",
      "-lc",
      'file_path="$1"; if [ -f "$file_path" ]; then cat "$file_path"; fi',
      "sh",
      containerPath,
    ]);
    if (result.exitCode !== 0) {
      return null;
    }
    return result.stdout;
  }

  private async terminateCommand(containerName: string, pidFile: string): Promise<void> {
    await this.runCommand(containerName, [
      "/bin/sh",
      "-lc",
      'pid_file="$1"; if [ ! -f "$pid_file" ]; then exit 0; fi; pid="$(cat "$pid_file")"; if [ -z "$pid" ]; then exit 0; fi; kill -TERM "$pid" 2>/dev/null || true; for _ in 1 2 3 4 5 6 7 8 9 10; do if ! kill -0 "$pid" 2>/dev/null; then exit 0; fi; sleep 0.1; done; kill -KILL "$pid" 2>/dev/null || true',
      "sh",
      pidFile,
    ]).catch(() => undefined);
  }

  /**
   * Translates a container-side path into an absolute host filesystem path.
   *
   * Handles `/workspace/memo/session`, `/workspace/memo/user`, and `/workspace`.
   * Returns an empty string for unrecognised paths.
   *
   * For database-backed stores with a `memoProvider`, memo paths resolve into
   * the temporary snapshot directory created at sandbox creation time.
   */
  translateToHostPath(sessionId: string, containerPath: string): string {
    const entry = this.sandboxes.get(sessionId);
    if (!entry) throw new Error(`No sandbox found for session '${sessionId}'`);

    const memoSession = "/workspace/memo/session";
    const memoUser = "/workspace/memo/user";
    const workspace = "/workspace";

    if (containerPath === memoSession || containerPath.startsWith(memoSession + "/")) {
      const rel = containerPath.slice(memoSession.length).replace(/^\//, "");
      return rel ? path.join(entry.memoSessionDir, rel) : entry.memoSessionDir;
    }

    if (containerPath === memoUser || containerPath.startsWith(memoUser + "/")) {
      const rel = containerPath.slice(memoUser.length).replace(/^\//, "");
      return rel ? path.join(entry.memoUserDir, rel) : entry.memoUserDir;
    }

    if (containerPath === workspace || containerPath.startsWith(workspace + "/")) {
      const rel = containerPath.slice(workspace.length).replace(/^\//, "");
      return rel ? path.join(entry.workspaceDir, rel) : entry.workspaceDir;
    }

    const skills = "/skills";
    if (containerPath === skills || containerPath.startsWith(skills + "/")) {
      const rel = containerPath.slice(skills.length).replace(/^\//, "");
      const skillsDir = path.join(this.dataDir, "skills");
      return rel ? path.join(skillsDir, rel) : skillsDir;
    }

    throw new Error(
      `Path '${containerPath}' is outside the sandbox. All paths must start with /workspace/ or /skills/.`,
    );
  }

  isContainerOnlyPath(containerPath: string): boolean {
    return containerPath === "/tmp" || containerPath.startsWith("/tmp/");
  }

  /**
   * Propagates a memo-path write back to the underlying store via
   * `memoProvider`.  Called by the sandboxed `Write` and `Edit` tools after
   * they successfully update the local temp-mirror file.
   *
   * No-op when no `memoProvider` is configured or when the container path is
   * not under `/workspace/memo/`.
   */
  async writeMemoBack(sessionId: string, containerPath: string, content: string): Promise<void> {
    if (!this.memoProvider) return;

    const entry = this.sandboxes.get(sessionId);
    if (!entry) return;

    const memoSessionPrefix = "/workspace/memo/session/";
    const memoUserPrefix = "/workspace/memo/user/";
    const toolResultsPrefix = `${memoSessionPrefix}tool-results/`;

    if (containerPath.startsWith(toolResultsPrefix)) {
      // e.g. /workspace/memo/session/tool-results/<toolCallId>.txt
      if (!this.memoProvider.writeToolResultArtifact) return;
      const filename = containerPath.slice(toolResultsPrefix.length);
      const toolCallId = filename.endsWith(".txt") ? filename.slice(0, -4) : filename;
      const sessionRef = `${entry.tenantId}:${entry.sessionId}`;
      await this.memoProvider.writeToolResultArtifact(sessionRef, toolCallId, content);
    } else if (containerPath.startsWith(memoSessionPrefix)) {
      // e.g. /workspace/memo/session/NOTES.md
      if (!this.memoProvider.writeMemoryDocument) return;
      const name = containerPath.slice(memoSessionPrefix.length);
      await this.memoProvider.writeMemoryDocument(
        entry.tenantId,
        entry.sessionId,
        "session",
        name,
        content,
      );
    } else if (containerPath.startsWith(memoUserPrefix)) {
      // e.g. /workspace/memo/user/USER.md
      if (!this.memoProvider.writeMemoryDocument) return;
      const name = containerPath.slice(memoUserPrefix.length);
      await this.memoProvider.writeMemoryDocument(
        entry.tenantId,
        entry.userId,
        "user",
        name,
        content,
      );
    }
  }

  /**
   * Updates a single file in the live host-side memo mirror without writing
   * back to the store.  Use this after a host-side write (e.g. compaction
   * persisting a tool-result artifact) so the agent can immediately read the
   * updated file from inside the container.
   *
   * No-op when the session has no active temp mirror (i.e. uses a filesystem
   * backend where `memoSessionDir` / `memoUserDir` are already the real paths).
   */
  async refreshMemoMirror(
    sessionId: string,
    containerPath: string,
    content: string,
  ): Promise<void> {
    const entry = this.sandboxes.get(sessionId);
    if (!entry || !entry.tempMemoBase) return;
    try {
      const hostPath = this.translateToHostPath(sessionId, containerPath);
      await mkdir(path.dirname(hostPath), { recursive: true });
      await writeFile(hostPath, content, "utf-8");
    } catch {
      // Non-fatal: mirror refresh failure must not disrupt host-side logic.
    }
  }

  /**
   * Refreshes the user-level memo file (`/workspace/memo/user/<name>`) in the
   * live mirror for **all** active sandboxes belonging to the given tenant+user
   * pair.
   *
   * Call this after any host-side write to a user-scoped memo document (e.g.
   * after `UserMemoryConsolidationService` rewrites `USER.md`) so that every
   * concurrently running session sees the updated content immediately.
   */
  async refreshUserMemoMirrorForAllSessions(
    tenantId: string,
    userId: string,
    name: string,
    content: string,
  ): Promise<void> {
    const containerPath = `/workspace/memo/user/${name}`;
    await Promise.allSettled(
      [...this.sandboxes.entries()]
        .filter(
          ([, entry]) =>
            entry.tenantId === tenantId && entry.userId === userId && entry.tempMemoBase,
        )
        .map(([sessionId]) => this.refreshMemoMirror(sessionId, containerPath, content)),
    );
  }

  async readFileInContainer(sessionId: string, containerPath: string): Promise<string> {
    const result = await this.runInSandbox(sessionId, ["cat", containerPath]);
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || `Failed to read '${containerPath}' (exit ${result.exitCode})`,
      );
    }
    return result.stdout;
  }

  async writeFileInContainer(
    sessionId: string,
    containerPath: string,
    content: string,
  ): Promise<void> {
    const dirPath = path.posix.dirname(containerPath);
    const fileName = path.posix.basename(containerPath);

    if (!fileName || fileName === "/" || fileName === ".") {
      throw new Error(`Invalid file path '${containerPath}'`);
    }

    const mkdirResult = await this.runInSandbox(sessionId, ["mkdir", "-p", dirPath]);
    if (mkdirResult.exitCode !== 0) {
      throw new Error(
        mkdirResult.stderr ||
          `Failed to create directory '${dirPath}' (exit ${mkdirResult.exitCode})`,
      );
    }

    const pack = tar.pack();
    const contentBuffer = Buffer.from(content, "utf-8");
    await new Promise<void>((resolve, reject) => {
      pack.entry(
        { name: fileName, size: contentBuffer.length },
        contentBuffer,
        (err?: Error | null) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });
    pack.finalize();

    const containerName = `sandbox-${sessionId}`;
    const container = this.docker.getContainer(containerName);
    await container.putArchive(pack, { path: dirPath });
  }

  getBrowserUrl(sessionId: string, endpointPath: string): string {
    const entry = this.sandboxes.get(sessionId);
    if (!entry) throw new Error(`No sandbox found for session '${sessionId}'`);
    return `http://127.0.0.1:${entry.browserPort}${endpointPath}`;
  }

  async listWorkspace(sessionId: string): Promise<string> {
    try {
      const result = await this.runInSandbox(
        sessionId,
        [
          "find",
          "/workspace",
          "-maxdepth",
          "4",
          "-not",
          "-path",
          "*/memo/*",
          "-not",
          "-path",
          "*/.git/*",
          "-not",
          "-name",
          ".*",
          "-type",
          "f",
        ],
        { timeout: 5_000 },
      );
      return result.stdout.trim();
    } catch {
      return "";
    }
  }

  async destroySandbox(sessionId: string): Promise<void> {
    const timer = this.idleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sessionId);
    }

    const entry = this.sandboxes.get(sessionId);
    this.sandboxes.delete(sessionId);
    this.pending.delete(sessionId);

    const containerName = `sandbox-${sessionId}`;
    try {
      await this.docker.getContainer(containerName).remove({ force: true });
    } catch {
      // Container may not exist
    }

    // Clean up temp memo snapshot directory if one was created.
    if (entry?.tempMemoBase) {
      await rm(entry.tempMemoBase, { recursive: true, force: true }).catch(() => {});
    }
  }

  async destroyAll(): Promise<void> {
    const sessionIds = new Set([...this.sandboxes.keys(), ...this.pending.keys()]);
    await Promise.allSettled([...sessionIds].map((sid) => this.destroySandbox(sid)));
  }

  async ensureImage(imageName: string = this.image): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
      console.log(`[sandbox] Image '${imageName}' available locally`);
    } catch {
      console.log(`[sandbox] Pulling image '${imageName}'...`);
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, (followErr: Error | null) => {
            if (followErr) reject(followErr);
            else resolve();
          });
        });
      });
      console.log(`[sandbox] Image '${imageName}' ready`);
    }
  }

  private resetIdleTimer(sessionId: string): void {
    const existing = this.idleTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      console.log(`[sandbox] Idle timeout for session ${sessionId}, destroying container`);
      void this.destroySandbox(sessionId);
    }, this.idleTimeoutMs);

    timer.unref(); // Allow the process to exit naturally when this is the last active timer.
    this.idleTimers.set(sessionId, timer);
  }
}
