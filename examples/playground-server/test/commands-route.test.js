/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */
import { Hono } from "hono";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
const dataDir = await mkdtemp(join(tmpdir(), "agentrail-commands-route-"));
const configPath = join(dataDir, "agentrail.yaml");
await writeFile(configPath, `version: 1\npaths:\n  dataDir: ${JSON.stringify(dataDir)}\n`, "utf8");
process.env.AGENTRAIL_CONFIG_PATH = configPath;
const { commands } = await import("../src/routes/commands.js");
after(async () => {
    await rm(dataDir, { recursive: true, force: true });
    delete process.env.AGENTRAIL_CONFIG_PATH;
});
test("commands route queues memory consolidation without creating a chat turn", async () => {
    const app = new Hono();
    app.route("/api/commands", commands);
    const response = await app.request("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            command: "/memory consolidate",
            tenantId: "default",
            userId: "user-1",
        }),
    });
    assert.equal(response.status, 200);
    const payload = (await response.json());
    assert.equal(payload.status, "queued");
    assert.match(payload.message ?? "", /USER\.md/i);
    const statePath = join(dataDir, "tenants", "default", "users", "user-1", ".memory-state.json");
    const stateRaw = await readFile(statePath, "utf8");
    assert.match(stateRaw, /"pendingReason": "manual"/);
});
test("commands route rejects /compact without a session", async () => {
    const app = new Hono();
    app.route("/api/commands", commands);
    const response = await app.request("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            command: "/compact",
            tenantId: "default",
            userId: "user-1",
        }),
    });
    assert.equal(response.status, 400);
    const payload = (await response.json());
    assert.equal(payload.status, "error");
    assert.match(payload.message ?? "", /已有会话/);
});
test("commands route lists slash commands with availability metadata", async () => {
    const app = new Hono();
    app.route("/api/commands", commands);
    const withoutSession = await app.request("/api/commands");
    assert.equal(withoutSession.status, 200);
    const withoutSessionPayload = (await withoutSession.json());
    assert.deepEqual(withoutSessionPayload.commands?.map((command) => ({
        name: command.name,
        available: command.available,
        unavailableReason: command.unavailableReason,
    })), [
        { name: "/memory consolidate", available: true, unavailableReason: null },
        { name: "/compact", available: false, unavailableReason: "需要先进入一个已有会话" },
    ]);
    const withSession = await app.request("/api/commands?sessionId=session-1");
    assert.equal(withSession.status, 200);
    const withSessionPayload = (await withSession.json());
    assert.deepEqual(withSessionPayload.commands?.map((command) => ({
        name: command.name,
        available: command.available,
        unavailableReason: command.unavailableReason,
    })), [
        { name: "/memory consolidate", available: true, unavailableReason: null },
        { name: "/compact", available: true, unavailableReason: null },
    ]);
});
//# sourceMappingURL=commands-route.test.js.map