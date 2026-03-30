/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { Hono } from "hono";

const health = new Hono();

health.get("/", (c) => c.json({ ok: true }));

export { health };
