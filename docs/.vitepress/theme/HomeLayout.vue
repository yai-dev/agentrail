<template>
  <div class="at-home" :class="{ 'at-home-zh': isZh }">
    <section class="at-hero">
      <div class="at-hero-left">
        <p class="at-eyebrow">{{ t.eyebrow }}</p>
        <h1 class="at-hero-title">
          <template v-for="(line, index) in t.heroTitleLines" :key="line">
            <template v-if="index === 1">
              {{ line.before }}<em>{{ line.emphasis }}</em
              >{{ line.after }}
            </template>
            <template v-else>
              {{ line.text }}
            </template>
            <br v-if="index < t.heroTitleLines.length - 1" />
          </template>
        </h1>
        <p class="at-hero-desc">{{ t.heroDesc }}</p>
        <div class="at-hero-actions">
          <a :href="t.quickstartLink" class="at-btn at-btn-primary"> {{ t.quickstartCta }} </a>
          <a
            href="https://github.com/yai-dev/agentrail"
            target="_blank"
            rel="noopener"
            class="at-btn at-btn-secondary"
          >
            {{ t.githubCta }}
          </a>
          <a href="/llms.txt" class="at-btn at-btn-secondary"> llms.txt </a>
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

    <section class="at-why-wrap">
      <div class="at-why-inner">
        <p class="at-section-label">{{ t.why.label }}</p>
        <h2 class="at-section-title">{{ t.why.title }}</h2>
        <p class="at-section-sub">{{ t.why.desc }}</p>

        <div class="at-why-grid">
          <div class="at-why-col">
            <p class="at-why-col-label">{{ t.why.left.label }}</p>
            <h3 class="at-why-col-title">{{ t.why.left.title }}</h3>
            <ul class="at-why-list">
              <li v-for="item in t.why.left.items" :key="item">{{ item }}</li>
            </ul>
          </div>

          <div class="at-why-col at-why-featured">
            <p class="at-why-col-label">{{ t.why.center.label }}</p>
            <h3 class="at-why-col-title">{{ t.why.center.title }}</h3>
            <ul class="at-why-list">
              <li v-for="item in t.why.center.items" :key="item">{{ item }}</li>
            </ul>
          </div>

          <div class="at-why-col">
            <p class="at-why-col-label">{{ t.why.right.label }}</p>
            <h3 class="at-why-col-title">{{ t.why.right.title }}</h3>
            <ul class="at-why-list">
              <li v-for="item in t.why.right.items" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="at-section">
      <p class="at-section-label">{{ t.features.label }}</p>
      <h2 class="at-section-title">{{ t.features.title }}</h2>
      <p class="at-section-sub">{{ t.features.desc }}</p>

      <div class="at-feature-grid">
        <div class="at-feature-card" v-for="card in t.features.cards" :key="card.pkg">
          <p class="at-feature-pkg">{{ card.pkg }}</p>
          <h3 class="at-feature-title">{{ card.title }}</h3>
          <p class="at-feature-desc" v-html="card.desc"></p>
        </div>
      </div>
    </section>

    <div class="at-install-strip">
      <div class="at-install-inner">
        <p class="at-install-label">{{ t.install.label }}</p>
        <div class="at-install-cmd">
          <code>npx @agentrail/cli@latest create</code>
          <button class="at-copy-btn" @click="copyInstall" :class="{ copied: installCopied }">
            {{ installCopied ? t.install.copied : t.install.copy }}
          </button>
        </div>
        <a :href="t.quickstartLink" class="at-btn at-btn-primary"> {{ t.install.cta }} </a>
      </div>
    </div>

    <section class="at-section">
      <p class="at-section-label">{{ t.architecture.label }}</p>
      <h2 class="at-section-title">{{ t.architecture.title }}</h2>
      <p class="at-section-sub" style="margin-bottom: 48px">{{ t.architecture.desc }}</p>

      <div class="at-arch-diagram">
        <div class="at-arch-layer at-arch-app">
          <div class="at-arch-header">
            <span class="at-arch-num">4</span>
            <span class="at-arch-name">{{ t.architecture.layers.app.name }}</span>
          </div>
          <div class="at-arch-chips">
            <span class="at-chip" v-for="chip in t.architecture.layers.app.chips" :key="chip">
              {{ chip }}
            </span>
          </div>
        </div>

        <div class="at-arch-arrow">{{ t.architecture.dependsOn }}</div>

        <div class="at-arch-layer at-arch-host">
          <div class="at-arch-header">
            <span class="at-arch-num">3</span>
            <span class="at-arch-name">@agentrail/app</span>
          </div>
          <div class="at-arch-chips">
            <span class="at-chip" v-for="chip in t.architecture.layers.host.chips" :key="chip">
              {{ chip }}
            </span>
          </div>
        </div>

        <div class="at-arch-arrow">{{ t.architecture.dependsOn }}</div>

        <div class="at-arch-layer at-arch-plugins">
          <div class="at-arch-header">
            <span class="at-arch-num">2</span>
            <span class="at-arch-name">@agentrail/capabilities</span>
          </div>
          <div class="at-arch-consumed">
            <span class="at-consumed-label">{{ t.architecture.includes }}</span>
            <div class="at-arch-chips">
              <span
                class="at-chip at-chip-accent"
                v-for="chip in t.architecture.layers.capabilities.chips"
                :key="chip"
              >
                {{ chip }}
              </span>
            </div>
          </div>
        </div>

        <div class="at-arch-arrow">{{ t.architecture.dependsOn }}</div>

        <div class="at-arch-layer at-arch-core">
          <div class="at-arch-header">
            <span class="at-arch-num">1</span>
            <span class="at-arch-name">@agentrail/core</span>
            <span class="at-arch-badge">{{ t.architecture.foundation }}</span>
          </div>
          <div class="at-arch-chips">
            <span class="at-chip" v-for="chip in t.architecture.layers.core.chips" :key="chip">
              {{ chip }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <footer class="at-footer">
      <div class="at-footer-inner">
        <div class="at-footer-logo">
          <img :src="withBase('/logomark-dark.svg')" alt="Agentrail" width="20" height="20" />
          Agentrail
        </div>
        <ul class="at-footer-links">
          <li>
            <a :href="t.quickstartLink">{{ t.footer.docs }}</a>
          </li>
          <li>
            <a href="/roadmap">{{ t.footer.roadmap }}</a>
          </li>
          <li>
            <a href="https://github.com/yai-dev/agentrail" target="_blank" rel="noopener">
              GitHub
            </a>
          </li>
          <li>
            <a
              href="https://github.com/yai-dev/agentrail/blob/master/LICENSE"
              target="_blank"
              rel="noopener"
            >
              Apache 2.0
            </a>
          </li>
        </ul>
        <p class="at-footer-meta">{{ t.footer.meta }}</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, withBase } from "vitepress";

const route = useRoute();
const isZh = computed(() => route.path.startsWith("/zh/"));

const copy = {
  en: {
    eyebrow: "Open Source · Pre-GA · Apache 2.0",
    heroTitleLines: [
      { text: "Build, host, and" },
      { before: "orchestrate ", emphasis: "tool-using", after: "" },
      { text: "AI agents." },
    ],
    heroDesc:
      "Agentrail gives you a composable runtime, a hosted server layer, multi-agent orchestration, and a clear extension model without locking you into any platform.",
    quickstartCta: "Quickstart →",
    githubCta: "View on GitHub",
    quickstartLink: "/guides/quickstart",
    why: {
      label: "Why Agentrail",
      title: "The right level of abstraction.",
      desc: "Most teams land between two extremes: scripts that break at scale and platforms that create lock-in. Agentrail is designed to sit in between.",
      left: {
        label: "Too little structure",
        title: "Ad hoc scripts",
        items: [
          "No session management",
          "Tool contracts are implicit",
          "Orchestration is bespoke every time",
          "Testing is painful",
          "Hard to extend without rewriting",
        ],
      },
      center: {
        label: "Just right",
        title: "Agentrail",
        items: [
          "Composable runtime with clear contracts",
          "Host layer for chat and stream lifecycles",
          "First-class multi-agent orchestration",
          "Plugin and context provider extension model",
          "No platform lock-in, fully self-hosted",
        ],
      },
      right: {
        label: "Too much lock-in",
        title: "Hosted platforms",
        items: [
          "Opaque internals",
          "Metered billing surprises",
          "Limited extensibility",
          "Vendor controls your data",
          "GUI-first, not code-first",
        ],
      },
    },
    features: {
      label: "What's included",
      title: "Everything you need to ship agents.",
      desc: "A focused set of packages. Each has a clear responsibility and can be used independently.",
      cards: [
        {
          pkg: "@agentrail/core",
          title: "Agent Runtime",
          desc: "Define agents with typed tool contracts. The LLM loop, tool dispatch, provider abstractions, prompt SDK, and usage tracking sit in one stable core.",
        },
        {
          pkg: "@agentrail/capabilities",
          title: "Capabilities",
          desc: "Sandboxed filesystem and browser tools, knowledge-base retrieval, skills registry, and multi-agent orchestration. They can be mounted with <code>defineProfile({ capabilities: [...] })</code>.",
        },
        {
          pkg: "@agentrail/app",
          title: "Host Layer",
          desc: "<code>createAgentApp</code> mounts chat and stream endpoints in one call. <code>defineProfile</code> wires model, prompt, and capabilities. Session management, plugins, slash commands, and typed config loading are included.",
        },
        {
          pkg: "@agentrail/capabilities · orchestration",
          title: "Multi-Agent Orchestration",
          desc: "Spawn sub-agents, send typed work, wait on conditions, and recover from failures. State can persist across restarts through JSONL-backed mailboxes.",
        },
        {
          pkg: "@agentrail/app · SessionManager",
          title: "Session Management",
          desc: "Filesystem-backed session storage with append-only JSONL history, automatic context compaction, and conversation branching.",
        },
        {
          pkg: "@agentrail/capabilities · sandbox",
          title: "Sandboxed Execution",
          desc: "Docker-based isolated execution for browser automation, shell commands, and file I/O. Execution is contained per session.",
        },
      ],
    },
    install: {
      label: "Get started in minutes.",
      copy: "copy",
      copied: "copied!",
      cta: "Read the quickstart →",
    },
    architecture: {
      label: "Architecture",
      title: "Layered by design.",
      desc: "Start with the recommended SDK path, then drop to lower-level primitives only when tighter control is needed.",
      dependsOn: "↓ depends on",
      includes: "includes →",
      foundation: "foundation",
      layers: {
        app: { name: "Your App", chips: ["Profiles", "Routes", "UI", "Business Logic"] },
        host: {
          chips: [
            "createAgentApp",
            "defineProfile",
            "SessionManager",
            "Plugins",
            "Slash Commands",
            "Config",
          ],
        },
        capabilities: {
          chips: [
            "filesystem",
            "browser",
            "knowledge",
            "skills",
            "orchestration",
            "tools",
            "sandbox",
            "memoryContext",
          ],
        },
        core: {
          chips: ["Agent Loop", "Tool Contract", "LLM Provider API", "Prompt SDK", "Session Types"],
        },
      },
    },
    footer: {
      docs: "Docs",
      roadmap: "Roadmap",
      meta: "Pre-GA · APIs may change before GA · © 2026 Agentrail contributors",
    },
  },
  zh: {
    eyebrow: "开源 · Pre-GA · Apache 2.0",
    heroTitleLines: [
      { text: "构建、托管并编排" },
      { before: "", emphasis: "可调用工具的", after: "" },
      { text: "AI Agent" },
    ],
    heroDesc:
      "Agentrail 提供可组合的运行时、面向托管场景的服务层、多 Agent 编排能力，以及清晰的扩展模型，同时保留自托管与自行组合的空间。",
    quickstartCta: "快速开始 →",
    githubCta: "查看 GitHub",
    quickstartLink: "/zh/guides/quickstart",
    why: {
      label: "为什么是 Agentrail",
      title: "处在合适的抽象层级。",
      desc: "很多团队会落在两个极端之间：一边是难以扩展的脚本集合，另一边是带来强绑定的平台。Agentrail 位于两者之间。",
      left: {
        label: "结构过少",
        title: "临时脚本",
        items: [
          "缺少 Session 管理",
          "工具契约隐含在代码中",
          "编排方式每次都要重写",
          "测试成本高",
          "后续扩展常常需要返工",
        ],
      },
      center: {
        label: "恰当的结构",
        title: "Agentrail",
        items: [
          "可组合的运行时与清晰契约",
          "覆盖 `/chat` 与 `/stream` 的 Host 层",
          "内建支持的多 Agent 编排",
          "Plugin 与 Context Provider 扩展模型",
          "无平台锁定，可完全自托管",
        ],
      },
      right: {
        label: "绑定过强",
        title: "托管平台",
        items: [
          "内部实现不透明",
          "计费方式难以预估",
          "扩展能力受限",
          "数据受制于供应方",
          "以 GUI 为主，而非以代码为主",
        ],
      },
    },
    features: {
      label: "包含内容",
      title: "覆盖交付 Agent 所需的核心部分。",
      desc: "文档与包结构按职责划分。每个包职责明确，也可以单独使用。",
      cards: [
        {
          pkg: "@agentrail/core",
          title: "Agent 运行时",
          desc: "用于定义 Agent 与类型化工具契约。LLM 循环、工具调度、LLM Provider 抽象、Prompt SDK 与用量统计都位于这一层。",
        },
        {
          pkg: "@agentrail/capabilities",
          title: "能力包",
          desc: "提供沙箱文件系统与浏览器工具、知识库检索、技能注册以及多 Agent 编排，可通过 <code>defineProfile({ capabilities: [...] })</code> 组合到 Profile 中。",
        },
        {
          pkg: "@agentrail/app",
          title: "Host 层",
          desc: "<code>createAgentApp</code> 一次挂载聊天与流式接口，<code>defineProfile</code> 负责连接模型、Prompt 与能力。Session 管理、Plugin、Slash Command 与配置加载也位于这一层。",
        },
        {
          pkg: "@agentrail/capabilities · orchestration",
          title: "多 Agent 编排",
          desc: "用于创建子 Agent、分发结构化任务、等待条件完成，并在失败后恢复。状态可通过基于 JSONL 的邮箱机制跨重启保留。",
        },
        {
          pkg: "@agentrail/app · SessionManager",
          title: "Session 管理",
          desc: "基于文件系统的 Session 存储，使用追加式 JSONL 历史记录，并支持自动上下文压缩与会话分支。",
        },
        {
          pkg: "@agentrail/capabilities · sandbox",
          title: "沙箱执行",
          desc: "基于 Docker 的隔离执行环境，用于浏览器自动化、Shell 命令与文件读写，并按 Session 维度隔离。",
        },
      ],
    },
    install: {
      label: "几分钟内完成初始化。",
      copy: "复制",
      copied: "已复制",
      cta: "阅读快速开始 →",
    },
    architecture: {
      label: "架构",
      title: "按层组织。",
      desc: "优先使用推荐的 SDK 入口；需要更细控制时，再下探到底层原语。",
      dependsOn: "↓ 依赖于",
      includes: "包含 →",
      foundation: "基础层",
      layers: {
        app: { name: "业务应用", chips: ["Profile", "路由", "UI", "业务逻辑"] },
        host: {
          chips: [
            "createAgentApp",
            "defineProfile",
            "SessionManager",
            "Plugin",
            "Slash Command",
            "Config",
          ],
        },
        capabilities: {
          chips: [
            "Filesystem",
            "Browser",
            "Knowledge",
            "Skills",
            "Orchestration",
            "Tools",
            "Sandbox",
            "Memory Context",
          ],
        },
        core: {
          chips: ["Agent Loop", "Tool Contract", "LLM Provider API", "Prompt SDK", "Session Types"],
        },
      },
    },
    footer: {
      docs: "文档",
      roadmap: "路线图（英文）",
      meta: "Pre-GA · 在 GA 之前 API 可能继续调整 · © 2026 Agentrail contributors",
    },
  },
} as const;

const t = computed(() => (isZh.value ? copy.zh : copy.en));

const installCopied = ref(false);

function copyInstall() {
  navigator.clipboard.writeText("npx @agentrail/cli@latest create").then(() => {
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
  background-image: radial-gradient(circle, rgba(196, 255, 46, 0.14) 1.5px, transparent 1.5px);
  background-size: 20px 20px;
}

.at-eyebrow {
  font-family: var(--at-font-family-label);
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--at-accent);
  margin-bottom: 28px;
  line-height: 2;
}

.at-hero-title {
  font-family: var(--at-font-family-display);
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
  font-family: var(--at-font-family-ui-strong);
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
  border: 1px solid rgba(196, 255, 46, 0.25);
  border-radius: 4px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(196, 255, 46, 0.08),
    0 0 24px rgba(196, 255, 46, 0.06),
    0 24px 60px rgba(0, 0, 0, 0.6);
  position: relative;
}

.at-code-window::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 3px,
    rgba(0, 0, 0, 0.13) 3px,
    rgba(0, 0, 0, 0.13) 4px
  );
  pointer-events: none;
  z-index: 2;
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
  font-family: var(--at-font-family-label);
  font-size: 0.52rem;
  letter-spacing: 0.04em;
  color: var(--at-accent);
  text-transform: uppercase;
  margin-bottom: 22px;
  line-height: 2;
}

.at-section-title {
  font-family: var(--at-font-family-display);
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
  background-image: radial-gradient(circle, rgba(196, 255, 46, 0.07) 1px, transparent 1px);
  background-size: 20px 20px;
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
  position: relative;
}

.at-why-featured::before,
.at-why-featured::after {
  content: "";
  position: absolute;
  width: 4px;
  height: 4px;
  pointer-events: none;
  background: var(--at-accent);
}

.at-why-featured::before {
  top: -1px;
  left: -1px;
  box-shadow:
    4px 0 0 0 var(--at-accent),
    8px 0 0 0 var(--at-accent),
    12px 0 0 0 var(--at-accent),
    16px 0 0 0 var(--at-accent),
    0 4px 0 0 var(--at-accent),
    0 8px 0 0 var(--at-accent),
    0 12px 0 0 var(--at-accent),
    0 16px 0 0 var(--at-accent);
}

.at-why-featured::after {
  bottom: -1px;
  right: -1px;
  box-shadow:
    -4px 0 0 0 var(--at-accent),
    -8px 0 0 0 var(--at-accent),
    -12px 0 0 0 var(--at-accent),
    -16px 0 0 0 var(--at-accent),
    0 -4px 0 0 var(--at-accent),
    0 -8px 0 0 var(--at-accent),
    0 -12px 0 0 var(--at-accent),
    0 -16px 0 0 var(--at-accent);
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
  font-family: var(--at-pixel-font);
  font-size: 0.42rem;
  line-height: 2;
  color: var(--at-accent);
}

.at-why-col-title {
  font-family: var(--at-font-family-display);
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
  content: "▶";
  color: var(--at-accent);
  font-size: 0.5rem;
  top: 0.15em;
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
  transition:
    background 0.15s,
    outline-color 0.15s,
    box-shadow 0.15s;
  outline: 2px solid transparent;
  outline-offset: -2px;
}

.at-feature-card:hover {
  background: #080808;
  outline-color: var(--at-accent);
  box-shadow: inset 0 0 20px rgba(196, 255, 46, 0.04);
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
  background-image: radial-gradient(circle, rgba(196, 255, 46, 0.06) 1px, transparent 1px);
  background-size: 20px 20px;
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
  font-family: var(--at-font-family-display);
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
  font-family: var(--at-font-family-display);
  font-size: 1rem;
  color: var(--vp-c-text-1);
}

.at-arch-core .at-arch-name,
.at-arch-host .at-arch-name {
  color: var(--at-accent);
}

.at-arch-badge {
  font-family: var(--at-font-family-label);
  font-size: 0.46rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: var(--at-accent);
  color: #060606;
  padding: 5px 10px;
  line-height: 1.6;
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
  font-family: var(--at-font-family-ui-strong);
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
  font-family: var(--at-font-family-display);
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
  font-family: var(--at-font-family-ui-strong);
  font-size: 0.7rem;
  color: #333330;
  margin: 0;
  flex-shrink: 0;
}

.at-home-zh .at-eyebrow,
.at-home-zh .at-section-label,
.at-home-zh .at-why-col-label,
.at-home-zh .at-arch-badge,
.at-home-zh .at-consumed-label,
.at-home-zh .at-copy-btn,
.at-home-zh .at-arch-arrow,
.at-home-zh .at-footer-meta {
  letter-spacing: 0.01em;
  text-transform: none;
}

.at-home-zh .at-eyebrow,
.at-home-zh .at-section-label {
  font-size: 0.72rem;
  line-height: 1.8;
}

.at-home-zh .at-hero-title em {
  font-style: normal;
}

.at-home-zh .at-btn {
  letter-spacing: 0.01em;
}

.at-home-zh .at-why-featured .at-why-col-label {
  font-size: 0.65rem;
  line-height: 1.7;
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
