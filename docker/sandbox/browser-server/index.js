/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

"use strict";

const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 8080;

let browser = null;
let page = null;

async function ensurePage() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
  }
  if (!page || page.isClosed()) {
    page = await browser.newPage();
    await page.setViewportSize({ width: 1024, height: 768 });
  }
  return page;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/navigate", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });

    const p = await ensurePage();
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const title = await p.title();
    const textContent = await p.evaluate(() => document.body?.innerText ?? "");

    res.json({ title, url: p.url(), textContent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/scroll", async (req, res) => {
  try {
    const { selector, direction = "down", amount = 500, deltaX, deltaY } = req.body;
    const p = await ensurePage();

    let dx = deltaX ?? 0;
    let dy = deltaY ?? 0;

    if (deltaX === undefined && deltaY === undefined) {
      if (direction === "down") dy = amount;
      else if (direction === "up") dy = -amount;
      else if (direction === "right") dx = amount;
      else if (direction === "left") dx = -amount;
    }

    if (selector) {
      await p
        .locator(selector)
        .first()
        .evaluate((el, [scrollX, scrollY]) => el.scrollBy(scrollX, scrollY), [dx, dy]);
    } else {
      await p.evaluate(([scrollX, scrollY]) => window.scrollBy(scrollX, scrollY), [dx, dy]);
    }

    const { scrollX, scrollY } = await p.evaluate(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }));

    res.json({ scrollX, scrollY });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/action", async (req, res) => {
  try {
    const { type, selector, value, script } = req.body;
    if (!type) return res.status(400).json({ error: "type is required" });

    const p = await ensurePage();
    let result;

    switch (type) {
      case "click":
        if (!selector) return res.status(400).json({ error: "selector required for click" });
        await p.locator(selector).click({ timeout: 10_000 });
        break;
      case "fill":
        if (!selector) return res.status(400).json({ error: "selector required for fill" });
        await p.locator(selector).fill(value ?? "", { timeout: 10_000 });
        break;
      case "select":
        if (!selector) return res.status(400).json({ error: "selector required for select" });
        await p.locator(selector).selectOption(value ?? "", { timeout: 10_000 });
        break;
      case "hover":
        if (!selector) return res.status(400).json({ error: "selector required for hover" });
        await p.locator(selector).hover({ timeout: 10_000 });
        break;
      case "press":
        if (!value) return res.status(400).json({ error: "value (key) required for press" });
        if (selector) {
          await p.locator(selector).press(value, { timeout: 10_000 });
        } else {
          await p.keyboard.press(value);
        }
        break;
      case "evaluate":
        if (!script) return res.status(400).json({ error: "script required for evaluate" });
        result = await p.evaluate(script);
        break;
      default:
        return res.status(400).json({ error: `Unknown action type: ${type}` });
    }

    res.json({ result: result !== undefined ? String(result) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/content", async (_req, res) => {
  try {
    const p = await ensurePage();
    const textContent = await p.evaluate(() => document.body?.innerText ?? "");
    const html = await p.content();
    res.json({ textContent, html });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/close", async (_req, res) => {
  try {
    if (page && !page.isClosed()) {
      await page.close();
      page = null;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/screenshot", async (_req, res) => {
  try {
    const p = await ensurePage();
    const screenshot = await p.screenshot({ type: "png", fullPage: false });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store, no-cache");
    res.send(screenshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`browser-server listening on port ${PORT}`);
});
