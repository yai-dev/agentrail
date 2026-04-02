import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Agentrail",
  description:
    "Open-source agent harness framework for building, hosting, and orchestrating tool-using AI agents.",

  // Custom domain: https://agentrail.run (root path, no sub-directory prefix)
  base: "/",

  cleanUrls: true,
  appearance: "force-dark",

  // Links pointing to source files or root-level files outside docs/ are valid
  // when browsing on GitHub but don't resolve inside the VitePress site.
  ignoreDeadLinks: [/\.\.\/\.\.\/packages\//, /\.\.\/\.\.\/examples\//, /\.\.\/\.\.\/ROADMAP/],

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["meta", { property: "og:type", content: "website" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Build, host, and orchestrate tool-using AI agents. More structure than ad hoc scripts, less lock-in than a hosted platform.",
      },
    ],
  ],

  themeConfig: {
    logo: { src: "/logomark-dark.svg", alt: "Agentrail" },
    siteTitle: "Agentrail",

    nav: [
      { text: "Guide", link: "/guides/quickstart" },
      { text: "Concepts", link: "/concepts/agents" },
      { text: "Reference", link: "/reference/host-defaults" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "GitHub", link: "https://github.com/yai-dev/agentrail" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Quickstart", link: "/guides/quickstart" },
          { text: "Architecture Overview", link: "/architecture/README" },
        ],
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
        text: "Guides",
        items: [
          { text: "Build a Profile", link: "/guides/build-a-profile" },
          { text: "Manage Prompts", link: "/guides/manage-prompts" },
          { text: "Add Tools", link: "/guides/add-tools" },
          { text: "Add Context", link: "/guides/add-context" },
          { text: "Configure Sessions", link: "/guides/configure-sessions" },
          { text: "Consume Stream (SSE)", link: "/guides/consume-stream" },
          { text: "Write a Plugin", link: "/guides/write-a-plugin" },
          {
            text: "Multi-Agent Orchestration",
            link: "/guides/multi-agent",
          },
          {
            text: "Use Capability Packages",
            link: "/guides/use-capability-packages",
          },
          { text: "Deployment", link: "/guides/deployment" },
          { text: "Troubleshooting", link: "/guides/troubleshooting" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Host Defaults", link: "/reference/host-defaults" },
          { text: "Host Primitives", link: "/reference/host-primitives" },
          { text: "Profile Contract", link: "/reference/profile-contract" },
          { text: "Plugin Contract", link: "/reference/plugin-contract" },
          { text: "Prompt SDK", link: "/reference/prompt-sdk" },
          { text: "Session Store", link: "/reference/session-store" },
          { text: "Events", link: "/reference/events" },
        ],
      },
      {
        text: "Examples",
        items: [
          {
            text: "Playground Server",
            link: "/examples/playground-server",
          },
          { text: "Playground UI", link: "/examples/playground-ui" },
          { text: "Deep Research", link: "/examples/deep-research" },
        ],
      },
    ],

    editLink: {
      pattern: "https://github.com/yai-dev/agentrail/edit/master/docs/:path",
      text: "Edit this page on GitHub",
    },

    socialLinks: [{ icon: "github", link: "https://github.com/yai-dev/agentrail" }],

    footer: {
      message: "Released under the Apache 2.0 License.",
      copyright: "© 2026 Agentrail contributors",
    },

    search: {
      provider: "local",
    },
  },
});
