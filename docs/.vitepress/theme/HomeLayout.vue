<template>
  <div class="at-home">
    <!-- ─── HERO ─── -->
    <section class="at-hero">
      <div class="at-hero-left">
        <p class="at-eyebrow">Open Source · Pre-GA · Apache 2.0</p>
        <h1 class="at-hero-title">
          Build, host, and<br />
          orchestrate <em>tool-using</em><br />
          AI agents.
        </h1>
        <p class="at-hero-desc">
          Agentrail gives you a composable runtime, a hosted server layer, multi-agent
          orchestration, and a clear extension model — without locking you into any platform.
        </p>
        <div class="at-hero-actions">
          <a href="/guides/quickstart" class="at-btn at-btn-primary"> Quickstart → </a>
          <a
            href="https://github.com/yai-dev/agentrail"
            target="_blank"
            rel="noopener"
            class="at-btn at-btn-secondary"
          >
            View on GitHub
          </a>
        </div>
      </div>

      <div class="at-hero-right">
        <div class="at-code-window">
          <div class="at-code-bar">
            <span class="at-dot at-dot-r"></span>
            <span class="at-dot at-dot-y"></span>
            <span class="at-dot at-dot-g"></span>
            <span class="at-file-name">agent.ts</span>
          </div>
          <pre
            class="at-code-body"
          ><span class="kw">import</span> <span class="op">{</span> <span class="fn">defineAgent</span> <span class="op">}</span> <span class="kw">from</span> <span class="str">"@agentrail/core"</span><span class="op">;</span>
<span class="kw">import</span> <span class="op">{</span> <span class="fn">defineProfile</span> <span class="op">}</span> <span class="kw">from</span> <span class="str">"@agentrail/app"</span><span class="op">;</span>

<span class="kw">export const</span> <span class="prop">researchAgent</span> <span class="op">=</span> <span class="fn">defineAgent</span><span class="op">({</span>
  <span class="prop">id</span><span class="op">:</span> <span class="str">"researcher"</span><span class="op">,</span>
  <span class="prop">model</span><span class="op">:</span> <span class="op">{</span>
    <span class="prop">provider</span><span class="op">:</span> <span class="str">"anthropic"</span><span class="op">,</span>
    <span class="prop">modelId</span><span class="op">:</span> <span class="str">"claude-sonnet-4-5"</span><span class="op">,</span>
    <span class="prop">apiKey</span><span class="op">:</span> <span class="fn">process</span><span class="op">.</span><span class="prop">env</span><span class="op">.</span><span class="type">ANTHROPIC_API_KEY</span><span class="op">,</span>
  <span class="op">},</span>
  <span class="prop">system</span><span class="op">:</span> <span class="str">"You are a research assistant."</span><span class="op">,</span>
<span class="op">});</span>

<span class="com">// stream a response</span>
<span class="kw">const</span> <span class="prop">result</span> <span class="op">=</span> <span class="kw">await</span> <span class="prop">researchAgent</span><span class="op">.</span><span class="fn">stream</span><span class="op">(</span>
  <span class="str">"What are the latest advances in agentic AI?"</span><span class="op">,</span>
<span class="op">);</span><span class="at-cursor"></span></pre>
        </div>
      </div>
    </section>

    <!-- ─── WHY AGENTRAIL ─── -->
    <section class="at-why-wrap">
      <div class="at-why-inner">
        <p class="at-section-label">Why Agentrail</p>
        <h2 class="at-section-title">The right level of abstraction.</h2>
        <p class="at-section-sub">
          Most teams land between two extremes — scripts that break at scale and platforms that make
          you dependent. Agentrail is designed to sit in between.
        </p>

        <div class="at-why-grid">
          <div class="at-why-col">
            <p class="at-why-col-label">Too little structure</p>
            <h3 class="at-why-col-title">Ad hoc scripts</h3>
            <ul class="at-why-list">
              <li>No session management</li>
              <li>Tool contracts are implicit</li>
              <li>Orchestration is bespoke every time</li>
              <li>Testing is painful</li>
              <li>Hard to extend without rewriting</li>
            </ul>
          </div>

          <div class="at-why-col at-why-featured">
            <p class="at-why-col-label">Just right</p>
            <h3 class="at-why-col-title">Agentrail</h3>
            <ul class="at-why-list">
              <li>Composable runtime with clear contracts</li>
              <li>Host layer for chat &amp; stream lifecycles</li>
              <li>First-class multi-agent orchestration</li>
              <li>Plugin &amp; context provider extension model</li>
              <li>No platform lock-in, fully self-hosted</li>
            </ul>
          </div>

          <div class="at-why-col">
            <p class="at-why-col-label">Too much lock-in</p>
            <h3 class="at-why-col-title">Hosted platforms</h3>
            <ul class="at-why-list">
              <li>Opaque internals</li>
              <li>Metered billing surprises</li>
              <li>Limited extensibility</li>
              <li>Vendor controls your data</li>
              <li>GUI-first, not code-first</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── FEATURE GRID ─── -->
    <section class="at-section">
      <p class="at-section-label">What's included</p>
      <h2 class="at-section-title">Everything you need to ship agents.</h2>
      <p class="at-section-sub">
        A focused set of packages — each with a clear responsibility, each independently usable.
      </p>

      <div class="at-feature-grid">
        <div class="at-feature-card">
          <p class="at-feature-pkg">@agentrail/core</p>
          <h3 class="at-feature-title">Agent Runtime</h3>
          <p class="at-feature-desc">
            Define agents with typed tool contracts. The LLM loop, tool dispatch, provider
            abstractions, prompt SDK, and usage tracking — all in one stable core.
          </p>
        </div>

        <div class="at-feature-card">
          <p class="at-feature-pkg">@agentrail/capabilities</p>
          <h3 class="at-feature-title">Capabilities</h3>
          <p class="at-feature-desc">
            Sandboxed filesystem and browser tools, knowledge-base retrieval, skills registry, and
            multi-agent orchestration — each independently usable via
            <code>defineProfile({ capabilities: [...] })</code>.
          </p>
        </div>

        <div class="at-feature-card">
          <p class="at-feature-pkg">@agentrail/app</p>
          <h3 class="at-feature-title">Host Layer</h3>
          <p class="at-feature-desc">
            <code>createAgentApp</code> mounts chat and stream endpoints in one call.
            <code>defineProfile</code> wires model, prompt, and capabilities. Includes session
            management, plugins, slash-commands, and typed config loading.
          </p>
        </div>

        <div class="at-feature-card">
          <p class="at-feature-pkg">@agentrail/capabilities · orchestration</p>
          <h3 class="at-feature-title">Multi-Agent Orchestration</h3>
          <p class="at-feature-desc">
            Spawn sub-agents, send typed work, wait on conditions, and recover from failures.
            Persistent state across restarts via JSONL-backed mailboxes.
          </p>
        </div>

        <div class="at-feature-card">
          <p class="at-feature-pkg">@agentrail/app · SessionManager</p>
          <h3 class="at-feature-title">Session Management</h3>
          <p class="at-feature-desc">
            Filesystem-backed session storage with append-only JSONL history, automatic context
            compaction, and conversation branching.
          </p>
        </div>

        <div class="at-feature-card">
          <p class="at-feature-pkg">@agentrail/capabilities · sandbox</p>
          <h3 class="at-feature-title">Sandboxed Execution</h3>
          <p class="at-feature-desc">
            Docker-based isolated execution environment. Browser automation, shell commands, and
            file I/O — all safely contained per session.
          </p>
        </div>
      </div>
    </section>

    <!-- ─── INSTALL ─── -->
    <div class="at-install-strip">
      <div class="at-install-inner">
        <p class="at-install-label">Get started in minutes.</p>
        <div class="at-install-cmd">
          <code>npm create agentrail-app@latest</code>
          <button class="at-copy-btn" @click="copyInstall" :class="{ copied: installCopied }">
            {{ installCopied ? "copied!" : "copy" }}
          </button>
        </div>
        <a href="/guides/quickstart" class="at-btn at-btn-primary"> Read the quickstart → </a>
      </div>
    </div>

    <!-- ─── ARCHITECTURE ─── -->
    <section class="at-section">
      <p class="at-section-label">Architecture</p>
      <h2 class="at-section-title">Layered by design.</h2>
      <p class="at-section-sub" style="margin-bottom: 48px">
        Start with the opinionated SDK, then drop to lower-level primitives only when you need
        tighter control.
      </p>

      <div class="at-arch-diagram">
        <div class="at-arch-layer at-arch-app">
          <div class="at-arch-header">
            <span class="at-arch-num">4</span>
            <span class="at-arch-name">Your App</span>
          </div>
          <div class="at-arch-chips">
            <span class="at-chip">Profiles</span>
            <span class="at-chip">Routes</span>
            <span class="at-chip">UI</span>
            <span class="at-chip">Business Logic</span>
          </div>
        </div>

        <div class="at-arch-arrow">↓ depends on</div>

        <div class="at-arch-layer at-arch-host">
          <div class="at-arch-header">
            <span class="at-arch-num">3</span>
            <span class="at-arch-name">@agentrail/app</span>
          </div>
          <div class="at-arch-chips">
            <span class="at-chip">createAgentApp</span>
            <span class="at-chip">defineProfile</span>
            <span class="at-chip">SessionManager</span>
            <span class="at-chip">Plugins</span>
            <span class="at-chip">Slash Commands</span>
            <span class="at-chip">Config</span>
          </div>
        </div>

        <div class="at-arch-arrow">↓ depends on</div>

        <div class="at-arch-layer at-arch-plugins">
          <div class="at-arch-header">
            <span class="at-arch-num">2</span>
            <span class="at-arch-name">@agentrail/capabilities</span>
          </div>
          <div class="at-arch-consumed">
            <span class="at-consumed-label">includes →</span>
            <div class="at-arch-chips">
              <span class="at-chip at-chip-accent">filesystem</span>
              <span class="at-chip at-chip-accent">browser</span>
              <span class="at-chip at-chip-accent">knowledge</span>
              <span class="at-chip at-chip-accent">skills</span>
              <span class="at-chip at-chip-accent">orchestration</span>
              <span class="at-chip at-chip-accent">tools</span>
              <span class="at-chip at-chip-accent">sandbox</span>
              <span class="at-chip at-chip-accent">memoryContext</span>
            </div>
          </div>
        </div>

        <div class="at-arch-arrow">↓ depends on</div>

        <div class="at-arch-layer at-arch-core">
          <div class="at-arch-header">
            <span class="at-arch-num">1</span>
            <span class="at-arch-name">@agentrail/core</span>
            <span class="at-arch-badge">foundation</span>
          </div>
          <div class="at-arch-chips">
            <span class="at-chip">Agent Loop</span>
            <span class="at-chip">Tool Contract</span>
            <span class="at-chip">LLM Provider API</span>
            <span class="at-chip">Prompt SDK</span>
            <span class="at-chip">Session Types</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── FOOTER ─── -->
    <footer class="at-footer">
      <div class="at-footer-inner">
        <div class="at-footer-logo">
          <img :src="withBase('/logomark-dark.svg')" alt="Agentrail" width="20" height="20" />
          Agentrail
        </div>
        <ul class="at-footer-links">
          <li><a href="/guides/quickstart">Docs</a></li>
          <li><a href="/roadmap">Roadmap</a></li>
          <li>
            <a href="https://github.com/yai-dev/agentrail" target="_blank" rel="noopener">GitHub</a>
          </li>
          <li>
            <a
              href="https://github.com/yai-dev/agentrail/blob/master/LICENSE"
              target="_blank"
              rel="noopener"
              >Apache 2.0</a
            >
          </li>
        </ul>
        <p class="at-footer-meta">
          Pre-GA · APIs may change before GA · © 2026 Agentrail contributors
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { withBase } from "vitepress";

const installCopied = ref(false);

function copyInstall() {
  navigator.clipboard.writeText("npm create agentrail-app@latest").then(() => {
    installCopied.value = true;
    setTimeout(() => {
      installCopied.value = false;
    }, 2000);
  });
}

onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("at-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 },
  );
  document.querySelectorAll(".at-fade").forEach((el) => observer.observe(el));
});
</script>

<style scoped>
/* ─── RESETS & LAYOUT ─── */
.at-home {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-base);
  min-height: 100vh;
}

/* ─── HERO ─── */
.at-hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 40px 80px;
}

.at-eyebrow {
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--at-accent);
  margin-bottom: 24px;
}

.at-hero-title {
  font-family: "DM Serif Display", Georgia, serif;
  font-size: clamp(2.6rem, 4vw, 4.2rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 24px;
  color: var(--vp-c-text-1);
}

.at-hero-title em {
  font-style: italic;
  color: var(--at-accent);
}

.at-hero-desc {
  font-size: 1rem;
  color: var(--vp-c-text-2);
  line-height: 1.7;
  max-width: 480px;
  margin-bottom: 36px;
}

.at-hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* ─── BUTTONS ─── */
.at-btn {
  display: inline-block;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  padding: 11px 22px;
  border-radius: 2px;
  border: 1px solid transparent;
  text-decoration: none !important;
  transition:
    background 0.2s,
    border-color 0.2s,
    color 0.2s;
  cursor: pointer;
  line-height: 1;
}

.at-btn-primary {
  background: var(--at-accent);
  border-color: var(--at-accent);
  color: #060606 !important;
  font-weight: 500;
}
.at-btn-primary:hover {
  background: #d4ff50;
  border-color: #d4ff50;
}

.at-btn-secondary {
  background: transparent;
  border-color: #262626;
  color: var(--vp-c-text-2) !important;
}
.at-btn-secondary:hover {
  border-color: #555550;
  color: var(--vp-c-text-1) !important;
}

/* ─── CODE WINDOW ─── */
.at-code-window {
  background: #0a0a0a;
  border: 1px solid #1c1c1c;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}

.at-code-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  background: #0f0f0f;
  border-bottom: 1px solid #1c1c1c;
}

.at-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.at-dot-r {
  background: #ff5f57;
}
.at-dot-y {
  background: #febc2e;
}
.at-dot-g {
  background: var(--at-accent);
}

.at-file-name {
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  color: #555550;
  margin-left: 8px;
}

.at-code-body {
  padding: 24px 28px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  line-height: 1.75;
  color: #b8b6b0;
  white-space: pre;
  overflow-x: auto;
  margin: 0;
  background: transparent;
  border: none;
}

/* code highlight tokens */
.at-code-body :deep(.kw) {
  color: #c4a0ff;
}
.at-code-body :deep(.fn) {
  color: #7dd3fc;
}
.at-code-body :deep(.str) {
  color: #86efac;
}
.at-code-body :deep(.op) {
  color: #94a3b8;
}
.at-code-body :deep(.prop) {
  color: #e2e8f0;
}
.at-code-body :deep(.type) {
  color: var(--at-accent);
}
.at-code-body :deep(.com) {
  color: #475569;
  font-style: italic;
}

/* inline spans for syntax colors (no :deep needed for scoped children) */
.at-code-body .kw {
  color: #c4a0ff;
}
.at-code-body .fn {
  color: #7dd3fc;
}
.at-code-body .str {
  color: #86efac;
}
.at-code-body .op {
  color: #94a3b8;
}
.at-code-body .prop {
  color: #e2e8f0;
}
.at-code-body .type {
  color: var(--at-accent);
}
.at-code-body .com {
  color: #475569;
  font-style: italic;
}

.at-cursor {
  display: inline-block;
  width: 8px;
  height: 1em;
  background: var(--at-accent);
  vertical-align: middle;
  animation: blink 1.1s step-end infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

/* ─── SECTION SHARED ─── */
.at-section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 40px;
}

.at-section-label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  letter-spacing: 0.16em;
  color: var(--at-accent);
  text-transform: uppercase;
  margin-bottom: 16px;
}

.at-section-title {
  font-family: "DM Serif Display", Georgia, serif;
  font-size: clamp(2rem, 3vw, 2.8rem);
  line-height: 1.15;
  letter-spacing: -0.01em;
  margin-bottom: 16px;
  color: var(--vp-c-text-1);
}

.at-section-sub {
  font-size: 1rem;
  color: var(--vp-c-text-2);
  max-width: 560px;
  line-height: 1.7;
  margin-bottom: 48px;
}

/* ─── WHY SECTION ─── */
.at-why-wrap {
  background: #0a0a0a;
  border-top: 1px solid #1c1c1c;
  border-bottom: 1px solid #1c1c1c;
}

.at-why-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 40px;
}

.at-why-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  border: 1px solid #1c1c1c;
  margin-top: 48px;
}

.at-why-col {
  padding: 36px 32px;
  border-right: 1px solid #1c1c1c;
  position: relative;
}

.at-why-col:last-child {
  border-right: none;
}

.at-why-featured {
  background: rgba(196, 255, 46, 0.03);
  border-color: var(--at-accent);
  border-left: 1px solid var(--at-accent);
  border-right: 1px solid var(--at-accent);
  margin: -1px;
  z-index: 1;
}

.at-why-col-label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #555550;
  margin-bottom: 14px;
}

.at-why-featured .at-why-col-label {
  color: var(--at-accent-dim);
}

.at-why-col-title {
  font-family: "DM Serif Display", Georgia, serif;
  font-size: 1.3rem;
  margin-bottom: 20px;
  color: var(--vp-c-text-1);
}

.at-why-featured .at-why-col-title {
  color: var(--at-accent);
}

.at-why-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.at-why-list li {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  padding-left: 18px;
  position: relative;
  line-height: 1.5;
}

.at-why-list li::before {
  content: "—";
  position: absolute;
  left: 0;
  color: #333330;
  font-size: 0.75rem;
}

.at-why-featured .at-why-list li::before {
  color: var(--at-accent);
}

/* ─── FEATURE GRID ─── */
.at-feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: #1c1c1c;
  border: 1px solid #1c1c1c;
}

.at-feature-card {
  background: var(--vp-c-bg);
  padding: 28px 26px;
  transition: background 0.2s;
}

.at-feature-card:hover {
  background: #0a0a0a;
}

.at-feature-pkg {
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  color: var(--at-accent);
  margin-bottom: 10px;
  letter-spacing: 0.02em;
}

.at-feature-title {
  font-family: "DM Serif Display", Georgia, serif;
  font-size: 1.05rem;
  color: var(--vp-c-text-1);
  margin-bottom: 10px;
}

.at-feature-desc {
  font-size: 0.84rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  margin: 0;
}

/* ─── INSTALL STRIP ─── */
.at-install-strip {
  background: #0a0a0a;
  border-top: 1px solid #1c1c1c;
  border-bottom: 1px solid #1c1c1c;
}

.at-install-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 48px 40px;
  display: flex;
  align-items: center;
  gap: 28px;
  flex-wrap: wrap;
}

.at-install-label {
  font-family: "DM Serif Display", Georgia, serif;
  font-size: 1.1rem;
  color: var(--vp-c-text-1);
  margin: 0;
  flex-shrink: 0;
}

.at-install-cmd {
  display: flex;
  align-items: center;
  gap: 0;
  background: #060606;
  border: 1px solid #1c1c1c;
  flex: 1;
  min-width: 280px;
  max-width: 480px;
}

.at-install-cmd code {
  font-family: var(--vp-font-family-mono) !important;
  font-size: 0.84rem !important;
  color: var(--at-accent) !important;
  background: transparent !important;
  border: none !important;
  padding: 12px 16px !important;
  flex: 1;
}

.at-copy-btn {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: #0f0f0f;
  border: none;
  border-left: 1px solid #1c1c1c;
  color: #555550;
  padding: 0 16px;
  cursor: pointer;
  height: 100%;
  min-height: 44px;
  transition:
    color 0.2s,
    background 0.2s;
  white-space: nowrap;
}

.at-copy-btn:hover {
  color: var(--vp-c-text-1);
  background: #141414;
}
.at-copy-btn.copied {
  color: var(--at-accent);
}

/* ─── ARCH DIAGRAM ─── */
.at-arch-diagram {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}

.at-arch-arrow {
  text-align: center;
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  color: #333330;
  letter-spacing: 0.06em;
  padding: 10px 0;
  position: relative;
}

.at-arch-arrow::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #1c1c1c;
  transform: translateX(-50%);
  z-index: 0;
}

.at-arch-layer {
  border: 1px solid #1c1c1c;
  background: #0a0a0a;
  padding: 24px 28px;
  position: relative;
  z-index: 1;
}

.at-arch-app {
  border-style: dashed;
  border-color: #333330;
  background: transparent;
}

.at-arch-host {
  border-color: rgba(196, 255, 46, 0.3);
  background: rgba(196, 255, 46, 0.02);
}

.at-arch-core {
  border-color: var(--at-accent);
  background: rgba(196, 255, 46, 0.04);
}

.at-arch-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.at-arch-num {
  font-family: var(--vp-font-family-mono);
  font-size: 0.62rem;
  background: #1c1c1c;
  color: #555550;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 2px;
}

.at-arch-core .at-arch-num,
.at-arch-host .at-arch-num {
  background: var(--at-accent);
  color: #060606;
}

.at-arch-name {
  font-family: "DM Serif Display", Georgia, serif;
  font-size: 1rem;
  color: var(--vp-c-text-1);
}

.at-arch-core .at-arch-name,
.at-arch-host .at-arch-name {
  color: var(--at-accent);
}

.at-arch-badge {
  font-family: var(--vp-font-family-mono);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: var(--at-accent);
  color: #060606;
  padding: 2px 8px;
}

.at-arch-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.at-chip {
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  color: var(--vp-c-text-2);
  background: #060606;
  border: 1px solid #1c1c1c;
  padding: 4px 10px;
  letter-spacing: 0.02em;
}

.at-chip-accent {
  color: var(--at-accent-dim);
  background: rgba(196, 255, 46, 0.04);
  border-color: rgba(196, 255, 46, 0.2);
}

.at-arch-consumed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.at-consumed-label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  color: #333330;
  text-transform: uppercase;
}

/* ─── FOOTER ─── */
.at-footer {
  border-top: 1px solid #1c1c1c;
  background: #060606;
}

.at-footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 40px;
  display: flex;
  align-items: center;
  gap: 40px;
  flex-wrap: wrap;
}

.at-footer-logo {
  font-family: "DM Serif Display", Georgia, serif;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vp-c-text-1);
}

.at-footer-links {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
  gap: 24px;
  flex: 1;
}

.at-footer-links a {
  font-size: 0.84rem;
  color: var(--vp-c-text-2) !important;
  text-decoration: none !important;
  transition: color 0.2s;
}

.at-footer-links a:hover {
  color: var(--at-accent) !important;
}

.at-footer-meta {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  color: #333330;
  margin: 0;
  flex-shrink: 0;
}

/* ─── RESPONSIVE ─── */
@media (max-width: 1024px) {
  .at-hero {
    grid-template-columns: 1fr;
    gap: 40px;
    padding-top: 60px;
  }
  .at-feature-grid {
    grid-template-columns: 1fr 1fr;
  }
  .at-why-grid {
    grid-template-columns: 1fr;
  }
  .at-why-col {
    border-right: none;
    border-bottom: 1px solid #1c1c1c;
  }
  .at-why-col:last-child {
    border-bottom: none;
  }
  .at-why-featured {
    margin: 0;
  }
}

@media (max-width: 640px) {
  .at-hero {
    padding: 60px 24px 40px;
  }
  .at-section {
    padding: 60px 24px;
  }
  .at-why-inner {
    padding: 60px 24px;
  }
  .at-feature-grid {
    grid-template-columns: 1fr;
  }
  .at-install-inner {
    padding: 40px 24px;
    flex-direction: column;
    align-items: flex-start;
  }
  .at-install-cmd {
    max-width: 100%;
    width: 100%;
  }
  .at-footer-inner {
    flex-direction: column;
    gap: 20px;
    padding: 32px 24px;
  }
}
</style>
