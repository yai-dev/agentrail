/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


import Docker from "dockerode";
import * as net from "node:net";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";

const runDockerCommand = promisify(execFile);

// ============================================================================
// ============================================================================

export const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? "ghcr.io/yai-dev/agentrail-sandbox:latest";
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB

// ============================================================================
// ============================================================================

export interface SandboxEntry {
  containerId: string;
  browserPort: number;
  workspaceDir: string;
  memoSessionDir: string;
  memoUserDir: string;
}

export interface RunOptions {
  timeout?: number;
  workingDir?: string;
  signal?: AbortSignal;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface SandboxManagerOptions {
  image?: string;
  idleTimeoutMs?: number;
}

// ============================================================================
// ============================================================================

function truncate(s: string, max: number): string {
  if (Buffer.byteLength(s, "utf-8") <= max) return s;
  return Buffer.from(s, "utf-8").subarray(0, max).toString("utf-8") + "\n[output truncated]";
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

export class SandboxManager {
  private readonly docker = new Docker();
  private readonly sandboxes = new Map<string, SandboxEntry>();
  private readonly pending = new Map<string, Promise<SandboxEntry>>();
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly image: string;
  private readonly idleTimeoutMs: number;

  constructor(
    private readonly dataDir: string,
    options: SandboxManagerOptions = {},
  ) {
    this.image = options.image ?? SANDBOX_IMAGE;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  }

  async ensureSandbox(
    sessionId: string,
    tenantId: string,
    userId: string,
  ): Promise<SandboxEntry> {
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

    await runDockerCommand("docker", [
      "exec", "-d", containerName,
      "node", "/opt/browser-server/index.js",
    ]);

    await waitForHealth(`http://127.0.0.1:${browserPort}/health`, 20_000);

    console.log(`[sandbox] Container ready for session ${sessionId} (browser port: ${browserPort})`);

    return { containerId: container.id, browserPort, workspaceDir, memoSessionDir, memoUserDir };
  }

  async runInSandbox(
    sessionId: string,
    cmd: string[],
    opts: RunOptions = {},
  ): Promise<ExecResult> {
    const entry = this.sandboxes.get(sessionId);
    if (!entry) throw new Error(`No sandbox found for session '${sessionId}'`);
    this.resetIdleTimer(sessionId);

    const containerName = `sandbox-${sessionId}`;
    const workDir = opts.workingDir ?? "/workspace";
    const timeoutMs = opts.timeout ?? 60_000;

    if (timeoutMs === 0) {
      try {
        await runDockerCommand("docker", ["exec", "-d", "-w", workDir, containerName, ...cmd]);
      } catch {
        // best effort
      }
      return { stdout: "", stderr: "", exitCode: 0, timedOut: true };
    }

    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    let timedOut = false;

    try {
      const result = await runDockerCommand(
        "docker",
        ["exec", "-w", workDir, containerName, ...cmd],
        {
          timeout: timeoutMs,
          maxBuffer: MAX_OUTPUT_BYTES,
          signal: opts.signal,
        },
      );
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err) {
      const e = err as {
        killed?: boolean;
        signal?: string;
        stdout?: string;
        stderr?: string;
        code?: string | number;
      };
      stdout = typeof e.stdout === "string" ? e.stdout : "";
      stderr = typeof e.stderr === "string" ? e.stderr : "";

      if (e.killed || e.signal === "SIGTERM" || e.signal === "SIGKILL") {
        timedOut = true;
      } else if (e.code === "ABORT_ERR") {
        timedOut = true;
      } else {
        exitCode = typeof e.code === "number" ? e.code : 1;
      }
    }

    return {
      stdout: truncate(stdout, MAX_OUTPUT_BYTES),
      stderr: truncate(stderr, MAX_OUTPUT_BYTES),
      exitCode,
      timedOut,
    };
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
      throw new Error(result.stderr || `Failed to read '${containerPath}' (exit ${result.exitCode})`);
    }
    return result.stdout;
  }

  async writeFileInContainer(sessionId: string, containerPath: string, content: string): Promise<void> {
    const b64 = Buffer.from(content, "utf-8").toString("base64");
    const dir = containerPath.includes("/") ? containerPath.replace(/\/[^/]+$/, "") : "/tmp";
    const result = await this.runInSandbox(sessionId, [
      "sh", "-c",
      `mkdir -p '${dir}' && printf '%s' '${b64}' | base64 -d > '${containerPath}'`,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to write '${containerPath}' (exit ${result.exitCode})`);
    }
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
          "find", "/workspace",
          "-maxdepth", "4",
          "-not", "-path", "*/memo/*",
          "-not", "-path", "*/.git/*",
          "-not", "-name", ".*",
          "-type", "f",
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
        this.docker.pull(
          imageName,
          (err: Error | null, stream: NodeJS.ReadableStream) => {
            if (err) return reject(err);
            this.docker.modem.followProgress(
              stream,
              (followErr: Error | null) => {
                if (followErr) reject(followErr);
                else resolve();
              },
            );
          },
        );
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
