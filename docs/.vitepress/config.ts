import { defineConfig, type DefaultTheme } from "vitepress";

const sharedHead = [
  ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  ["meta", { property: "og:type", content: "website" }],
];

const socialLinks: DefaultTheme.SocialLink[] = [
  { icon: "github", link: "https://github.com/yai-dev/agentrail" },
];

const enNav: DefaultTheme.NavItem[] = [
  { text: "Guides", link: "/guides/quickstart" },
  { text: "Concepts", link: "/concepts/agents" },
  { text: "Reference", link: "/reference/host-defaults" },
  { text: "Examples", link: "/examples/playground-server" },
  { text: "Roadmap", link: "/roadmap" },
  { text: "GitHub", link: "https://github.com/yai-dev/agentrail" },
];

const zhNav: DefaultTheme.NavItem[] = [
  { text: "指南", link: "/zh/guides/quickstart" },
  { text: "概念", link: "/zh/concepts/agents" },
  { text: "参考", link: "/zh/reference/create-agent-app" },
  { text: "示例（英文）", link: "/examples/playground-server" },
  { text: "路线图（英文）", link: "/roadmap" },
  { text: "GitHub", link: "https://github.com/yai-dev/agentrail" },
];

const enSidebar: DefaultTheme.Sidebar = [
  {
    text: "Getting Started",
    items: [{ text: "Quickstart", link: "/guides/quickstart" }],
  },
  {
    text: "Architecture",
    items: [{ text: "Overview", link: "/architecture/README" }],
  },
  {
    text: "Concepts",
    items: [
      { text: "Agents", link: "/concepts/agents" },
      { text: "Tools", link: "/concepts/tools" },
      { text: "Host", link: "/concepts/host" },
      { text: "Profiles", link: "/concepts/profiles" },
      { text: "Sessions", link: "/concepts/sessions" },
      { text: "Context & Compaction", link: "/concepts/context-and-compaction" },
      { text: "Plugins", link: "/concepts/plugins" },
      { text: "Prompts", link: "/concepts/prompts" },
      { text: "Events", link: "/concepts/events" },
      { text: "Orchestration", link: "/concepts/orchestration" },
    ],
  },
  {
    text: "Tools",
    collapsed: false,
    items: [
      { text: "Overview", link: "/tools/index" },
      { text: "Bash", link: "/tools/bash" },
      { text: "Read", link: "/tools/read" },
      { text: "Write", link: "/tools/write" },
      { text: "Edit", link: "/tools/edit" },
      { text: "Grep", link: "/tools/grep" },
      { text: "Glob", link: "/tools/glob" },
      { text: "WebFetch", link: "/tools/web-fetch" },
      { text: "WebSearch", link: "/tools/web-search" },
      { text: "AskUserQuestion", link: "/tools/ask-user-question" },
      { text: "TodoWrite", link: "/tools/todo-write" },
      { text: "Sleep", link: "/tools/sleep" },
      { text: "Python", link: "/tools/python" },
      { text: "BrowserNavigate", link: "/tools/browser-navigate" },
      { text: "BrowserContent", link: "/tools/browser-content" },
      { text: "BrowserScroll", link: "/tools/browser-scroll" },
      { text: "BrowserAction", link: "/tools/browser-action" },
      { text: "spawn_agent", link: "/tools/spawn-agent" },
      { text: "close_agent", link: "/tools/close-agent" },
      { text: "send_input", link: "/tools/send-input" },
      { text: "wait_agent", link: "/tools/wait-agent" },
    ],
  },
  {
    text: "Guides",
    items: [
      { text: "Build a Profile", link: "/guides/build-a-profile" },
      { text: "Manage Prompts", link: "/guides/manage-prompts" },
      { text: "Add Tools", link: "/guides/add-tools" },
      { text: "Tool Permissions", link: "/guides/tool-permissions" },
      { text: "Add Context", link: "/guides/add-context" },
      { text: "Configure Sessions", link: "/guides/configure-sessions" },
      { text: "Build a Storage Backend", link: "/guides/build-a-storage-backend" },
      { text: "Consume Stream (SSE)", link: "/guides/consume-stream" },
      { text: "Write a Plugin", link: "/guides/write-a-plugin" },
      { text: "Multi-Agent Orchestration", link: "/guides/multi-agent" },
      { text: "Use Capability Packages", link: "/guides/use-capability-packages" },
      { text: "Use OpenAI-Compatible Providers", link: "/guides/use-openai-compatible-providers" },
      { text: "Deployment", link: "/guides/deployment" },
      { text: "Troubleshooting", link: "/guides/troubleshooting" },
    ],
  },
  {
    text: "Reference",
    items: [
      { text: "createAgentApp", link: "/reference/create-agent-app" },
      { text: "Host Defaults", link: "/reference/host-defaults" },
      { text: "Host Primitives", link: "/reference/host-primitives" },
      { text: "Profile Contract", link: "/reference/profile-contract" },
      { text: "Plugin Contract", link: "/reference/plugin-contract" },
      { text: "Prompt SDK", link: "/reference/prompt-sdk" },
      { text: "Session Store", link: "/reference/session-store" },
      { text: "Events", link: "/reference/events" },
      { text: "Inspector Route", link: "/reference/inspector-route" },
      { text: "Telemetry Sink", link: "/reference/telemetry-sink" },
    ],
  },
  {
    text: "Examples",
    items: [
      { text: "Playground Server", link: "/examples/playground-server" },
      { text: "Playground UI", link: "/examples/playground-ui" },
      { text: "Deep Research", link: "/examples/deep-research" },
    ],
  },
];

const zhSidebar: DefaultTheme.Sidebar = [
  {
    text: "开始使用",
    items: [{ text: "快速开始", link: "/zh/guides/quickstart" }],
  },
  {
    text: "架构",
    items: [{ text: "架构总览", link: "/zh/architecture/README" }],
  },
  {
    text: "概念",
    items: [
      { text: "Agent", link: "/zh/concepts/agents" },
      { text: "工具", link: "/zh/concepts/tools" },
      { text: "插件", link: "/zh/concepts/plugins" },
      { text: "Host（英文）", link: "/concepts/host" },
      { text: "Profile（英文）", link: "/concepts/profiles" },
      { text: "Session（英文）", link: "/concepts/sessions" },
      { text: "上下文与压缩", link: "/zh/concepts/context-and-compaction" },
      { text: "Prompt（英文）", link: "/concepts/prompts" },
      { text: "事件（英文）", link: "/concepts/events" },
      { text: "编排（英文）", link: "/concepts/orchestration" },
    ],
  },
  {
    text: "指南",
    items: [
      { text: "构建 Profile", link: "/zh/guides/build-a-profile" },
      { text: "添加工具", link: "/zh/guides/add-tools" },
      { text: "添加上下文", link: "/zh/guides/add-context" },
      { text: "管理 Prompt", link: "/zh/guides/manage-prompts" },
      { text: "工具权限", link: "/zh/guides/tool-permissions" },
      { text: "配置 Session", link: "/zh/guides/configure-sessions" },
      { text: "构建存储后端", link: "/zh/guides/build-a-storage-backend" },
      { text: "消费流式响应", link: "/zh/guides/consume-stream" },
      { text: "部署", link: "/zh/guides/deployment" },
      { text: "编写插件", link: "/zh/guides/write-a-plugin" },
      { text: "使用能力包", link: "/zh/guides/use-capability-packages" },
      { text: "多 Agent 编排", link: "/zh/guides/multi-agent" },
      { text: "使用 OpenAI 兼容 Provider", link: "/zh/guides/use-openai-compatible-providers" },
      { text: "故障排查", link: "/zh/guides/troubleshooting" },
    ],
  },
  {
    text: "参考",
    items: [
      { text: "`createAgentApp`", link: "/zh/reference/create-agent-app" },
      { text: "Profile 契约", link: "/zh/reference/profile-contract" },
      { text: "兼容 API", link: "/zh/reference/host-defaults" },
      { text: "Host 原语", link: "/zh/reference/host-primitives" },
      { text: "Plugin 契约", link: "/zh/reference/plugin-contract" },
      { text: "Prompt SDK", link: "/zh/reference/prompt-sdk" },
      { text: "Session Store", link: "/zh/reference/session-store" },
      { text: "Inspector Route", link: "/zh/reference/inspector-route" },
      { text: "Telemetry Sink", link: "/zh/reference/telemetry-sink" },
      { text: "事件", link: "/zh/reference/events" },
    ],
  },
  {
    text: "示例",
    items: [
      { text: "Playground Server（英文）", link: "/examples/playground-server" },
      { text: "Playground UI（英文）", link: "/examples/playground-ui" },
      { text: "Deep Research（英文）", link: "/examples/deep-research" },
    ],
  },
];

function createThemeConfig(
  nav: DefaultTheme.NavItem[],
  sidebar: DefaultTheme.Sidebar,
  editLinkText: string,
  footerMessage: string,
) {
  return {
    logo: { src: "/logomark-dark.svg", alt: "Agentrail" },
    siteTitle: "Agentrail",
    nav,
    sidebar,
    editLink: {
      pattern: "https://github.com/yai-dev/agentrail/edit/master/docs/:path",
      text: editLinkText,
    },
    socialLinks,
    footer: {
      message: footerMessage,
      copyright: "© 2026 Agentrail contributors",
    },
    search: {
      provider: "local" as const,
    },
  };
}

export default defineConfig({
  title: "Agentrail",
  description:
    "Open-source agent harness framework for building, hosting, and orchestrating tool-using AI agents.",
  base: "/",
  cleanUrls: true,
  appearance: "force-dark",
  ignoreDeadLinks: [/\.\.\/\.\.\/packages\//, /\.\.\/\.\.\/examples\//, /\.\.\/\.\.\/ROADMAP/],
  head: [
    ...sharedHead,
    [
      "meta",
      {
        property: "og:description",
        content:
          "Build, host, and orchestrate tool-using AI agents. More structure than ad hoc scripts, less lock-in than a hosted platform.",
      },
    ],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      title: "Agentrail",
      description:
        "Open-source agent harness framework for building, hosting, and orchestrating tool-using AI agents.",
      themeConfig: createThemeConfig(
        enNav,
        enSidebar,
        "Edit this page on GitHub",
        "Released under the Apache 2.0 License.",
      ),
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
      title: "Agentrail",
      description: "用于构建、托管和编排可调用工具的 AI agent 的开源框架。",
      themeConfig: createThemeConfig(
        zhNav,
        zhSidebar,
        "在 GitHub 上编辑此页",
        "基于 Apache 2.0 许可证发布。",
      ),
    },
  },
});
