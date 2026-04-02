/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import Docker from "dockerode";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import * as net from "node:net";
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

/** Active sandbox record for one session. */
export interface SandboxEntry {
  containerId: string;
  browserPort: number;
  workspaceDir: string;
  memoSessionDir: string;
  memoUserDir: string;
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
 * @see {@link https://agentrail.run/guides/use-capability-packages}
 */
export class SandboxManager {
  private readonly docker: Docker;
  private readonly sandboxes = new Map<string, SandboxEntry>();
  private readonly pending = new Map<string, Promise<SandboxEntry>>();
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly image: string;
  private readonly idleTimeoutMs: number;

  constructor(
    private readonly dataDir: string,
    options: SandboxManagerOptions = {},
  ) {
    this.docker = options.docker ?? new Docker();
    this.image = options.image ?? SANDBOX_IMAGE;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
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
    const memoSessionDir = path.join(this.dataDir, "tenants", tenantId, "sessions", sessionId);
    const memoUserDir = path.join(this.dataDir, "tenants", tenantId, "users", userId);
    const skillsDir = path.join(this.dataDir, "skills");

    await Promise.all([
      mkdir(workspaceDir, { recursive: true }),
      mkdir(memoSessionDir, { recursive: true }),
      mkdir(memoUserDir, { recursive: true }),
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
          `${memoSessionDir}:/workspace/memo/session`,
          `${memoUserDir}:/workspace/memo/user`,
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

    return { containerId: container.id, browserPort, workspaceDir, memoSessionDir, memoUserDir };
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

    this.sandboxes.delete(sessionId);
    this.pending.delete(sessionId);

    const containerName = `sandbox-${sessionId}`;
    try {
      await this.docker.getContainer(containerName).remove({ force: true });
    } catch {
      // Container may not exist
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
