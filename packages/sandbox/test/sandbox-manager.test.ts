/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { SandboxManager } from "../src/sandbox-manager.js";

class FakeExec extends EventEmitter {
  exitCode: number | null = 0;

  constructor(private readonly handler: (exec: FakeExec) => void) {
    super();
  }

  async start(): Promise<FakeExec> {
    setTimeout(() => {
      this.handler(this);
    }, 0);
    return this;
  }

  async inspect(): Promise<{ ExitCode: number | null }> {
    return { ExitCode: this.exitCode };
  }

  writeStdout(text: string): void {
    this.emit("stdout", Buffer.from(text, "utf-8"));
  }

  writeStderr(text: string): void {
    this.emit("stderr", Buffer.from(text, "utf-8"));
  }

  close(exitCode: number): void {
    this.exitCode = exitCode;
    this.emit("close");
  }
}

class FakeContainer {
  readonly id = "container-1";

  constructor(private readonly docker: FakeDocker) {}

  async exec(options: { Cmd: string[]; Env?: string[] }): Promise<FakeExec> {
    return this.docker.createExec(options);
  }

  async remove(): Promise<void> {}

  async start(): Promise<void> {}

  async putArchive(): Promise<void> {}
}

class FakeDocker {
  readonly files = new Map<string, string>();
  readonly terminatedPidFiles: string[] = [];
  readonly modem = {
    demuxStream: (
      execStream: FakeExec,
      stdout: NodeJS.WritableStream,
      stderr: NodeJS.WritableStream,
    ) => {
      execStream.on("stdout", (chunk: Buffer) => {
        stdout.write(chunk);
      });
      execStream.on("stderr", (chunk: Buffer) => {
        stderr.write(chunk);
      });
      execStream.on("close", () => {
        stdout.end();
        stderr.end();
      });
    },
    followProgress: (_stream: NodeJS.ReadableStream, done: (error: Error | null) => void) => {
      done(null);
    },
  };

  private readonly container = new FakeContainer(this);
  private pidCounter = 1000;
  private readonly pendingByPidFile = new Map<string, FakeExec>();
  lastBackgroundFiles?: {
    stdoutFile: string;
    stderrFile: string;
    statusFile: string;
    pidFile: string;
  };

  getContainer(): FakeContainer {
    return this.container;
  }

  async createContainer(): Promise<FakeContainer> {
    return this.container;
  }

  getImage(): { inspect(): Promise<void> } {
    return {
      async inspect() {},
    };
  }

  pull(
    _imageName: string,
    callback: (error: Error | null, stream: NodeJS.ReadableStream) => void,
  ): void {
    callback(null, new EventEmitter() as NodeJS.ReadableStream);
  }

  createExec(options: { Cmd: string[]; Env?: string[] }): FakeExec {
    return new FakeExec((exec) => {
      this.handleExec(exec, options);
    });
  }

  private handleExec(
    exec: FakeExec,
    options: {
      Cmd: string[];
      Env?: string[];
    },
  ): void {
    const cmd = options.Cmd;
    const script = cmd[2] ?? "";

    if (script.includes('pid_file="$1"; shift; printf "%s" "$$" > "$pid_file"; exec "$@"')) {
      const pidFile = cmd[4]!;
      const actualCmd = cmd.slice(5);
      const pid = String(this.pidCounter++);
      this.files.set(pidFile, pid);

      if (actualCmd[0] === "ok") {
        exec.writeStdout("foreground ok\n");
        exec.writeStderr("foreground warn\n");
        exec.close(7);
        return;
      }

      if (actualCmd[0] === "slow") {
        exec.writeStdout("partial foreground\n");
        this.pendingByPidFile.set(pidFile, exec);
        return;
      }
    }

    if (script.includes('pid_file="$1"; if [ ! -f "$pid_file" ]; then exit 0; fi;')) {
      const pidFile = cmd[4]!;
      this.terminatedPidFiles.push(pidFile);
      const pending = this.pendingByPidFile.get(pidFile);
      if (pending) {
        this.pendingByPidFile.delete(pidFile);
        pending.close(143);
      }
      exec.close(0);
      return;
    }

    if (script.includes('file_path="$1"; if [ -f "$file_path" ]; then cat "$file_path"; fi')) {
      const filePath = cmd[4]!;
      const content = this.files.get(filePath);
      if (content) {
        exec.writeStdout(content);
      }
      exec.close(0);
      return;
    }

    if (script.includes('stdout_file="$1"; stderr_file="$2"; status_file="$3"; pid_file="$4";')) {
      const stdoutFile = cmd[4]!;
      const stderrFile = cmd[5]!;
      const statusFile = cmd[6]!;
      const pidFile = cmd[7]!;
      const env = new Map(
        (options.Env ?? []).map((entry) => {
          const [key, ...rest] = entry.split("=");
          return [key, rest.join("=")];
        }),
      );
      const command = env.get("AGENTRAIL_BASH_COMMAND") ?? "";
      const pid = String(this.pidCounter++);
      this.files.set(pidFile, pid);
      this.lastBackgroundFiles = { stdoutFile, stderrFile, statusFile, pidFile };

      if (command === "quick") {
        this.files.set(stdoutFile, "quick background\n");
        this.files.set(stderrFile, "");
        this.files.set(statusFile, "0");
      } else {
        this.files.set(stdoutFile, "partial background\n");
        this.files.set(stderrFile, "background stderr\n");
        setTimeout(() => {
          this.files.set(stdoutFile, "partial background\ncompleted background\n");
          this.files.set(statusFile, "0");
        }, 250);
      }

      exec.close(0);
      return;
    }

    exec.close(0);
  }
}

function createManager(docker: FakeDocker): SandboxManager {
  const manager = new SandboxManager("/tmp/agentrail-sandbox-tests", {
    docker: docker as never,
    idleTimeoutMs: 60_000,
  });
  (
    manager as unknown as {
      sandboxes: Map<
        string,
        {
          containerId: string;
          browserPort: number;
          workspaceDir: string;
          memoSessionDir: string;
          memoUserDir: string;
        }
      >;
    }
  ).sandboxes.set("session-1", {
    containerId: "container-1",
    browserPort: 8080,
    workspaceDir: "/tmp/workspace",
    memoSessionDir: "/tmp/session",
    memoUserDir: "/tmp/user",
  });
  return manager;
}

afterEach(() => {
  // Let background timers finish without leaking into later tests.
  return new Promise((resolve) => setTimeout(resolve, 300));
});

describe("SandboxManager", () => {
  it("runs foreground commands with strict exit status capture", async () => {
    const docker = new FakeDocker();
    const manager = createManager(docker);

    const result = await manager.runInSandbox("session-1", ["ok"], {
      timeout: 1_000,
    });

    expect(result).toEqual({
      stdout: "foreground ok\n",
      stderr: "foreground warn\n",
      exitCode: 7,
      timedOut: false,
    });
  });

  it("terminates timed out foreground commands instead of detaching them", async () => {
    const docker = new FakeDocker();
    const manager = createManager(docker);

    const result = await manager.runInSandbox("session-1", ["slow"], {
      timeout: 20,
    });

    expect(result.timedOut).toBe(true);
    expect(result.stdout).toContain("partial foreground");
    expect(result.exitCode).toBe(143);
    expect(docker.terminatedPidFiles).toHaveLength(1);
  });

  it("terminates aborted foreground commands and rejects the caller", async () => {
    const docker = new FakeDocker();
    const manager = createManager(docker);
    const controller = new AbortController();

    const promise = manager.runInSandbox("session-1", ["slow"], {
      timeout: 1_000,
      signal: controller.signal,
    });
    setTimeout(() => {
      controller.abort();
    }, 10);

    await expect(promise).rejects.toThrow("Sandbox command aborted");
    expect(docker.terminatedPidFiles).toHaveLength(1);
  });

  it("returns partial output for background bash commands while allowing them to finish later", async () => {
    const docker = new FakeDocker();
    const manager = createManager(docker);

    const result = await manager.runBackgroundShellCommand("session-1", "slow", {
      timeout: 20,
    });

    expect(result).toMatchObject({
      stdout: "partial background\n",
      stderr: "background stderr\n",
      exitCode: null,
      timedOut: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(docker.lastBackgroundFiles).toBeDefined();
    expect(docker.files.get(docker.lastBackgroundFiles!.statusFile)).toBe("0");
    expect(docker.files.get(docker.lastBackgroundFiles!.stdoutFile)).toContain(
      "completed background",
    );
  });
});
