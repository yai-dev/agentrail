---
layout: home

hero:
  name: "Agentrail"
  text: "Agent Harness Framework"
  tagline: Build, host, and orchestrate tool-using AI agents. More structure than ad hoc scripts, less lock-in than a hosted platform.
  image:
    src: /favicon.svg
    alt: Agentrail
  actions:
    - theme: brand
      text: Quickstart →
      link: /guides/quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/yai-dev/agentrail

features:
  - icon: ⚙️
    title: Runtime Core
    details: Typed agent definitions, LLM loop, tool dispatch, and provider abstractions. The stable foundation everything else builds on.
    link: /concepts/agents
    linkText: Learn about agents

  - icon: 🌐
    title: Host Layer
    details: Chat and stream request lifecycles, profile resolution, session context assembly, and a plugin system for cross-cutting behavior.
    link: /concepts/host
    linkText: Learn about the host

  - icon: 🔀
    title: Multi-Agent Orchestration
    details: Spawn sub-agents, send typed work, wait on conditions, and recover from failures — all with persistent JSONL-backed state.
    link: /guides/multi-agent
    linkText: Orchestration guide

  - icon: 📝
    title: Prompt SDK
    details: Compose system prompts from versioned fragments and bundles. File-based authoring with hot-reload and variable interpolation.
    link: /concepts/prompts
    linkText: Prompt concepts

  - icon: 💾
    title: Session Memory
    details: Filesystem-backed session storage with append-only history, automatic context compaction, and conversation branching.
    link: /concepts/memory-and-context
    linkText: Memory & context

  - icon: 📦
    title: Sandboxed Execution
    details: Docker-based isolated execution environment. Browser automation, shell commands, and file I/O — safely contained per session.
    link: /reference/host-defaults
    linkText: Host defaults reference
---
