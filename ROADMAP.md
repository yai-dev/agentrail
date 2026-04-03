# Roadmap

This document describes the current development stage and planned directions for Agentrail.

## Current Stage: Pre-GA

Agentrail is under active development. Public APIs, package boundaries, and the recommended SDK surface may change before the first stable release.

What pre-GA means in practice:

- Minor versions may contain breaking changes
- Package structure may be reorganized
- Documentation is expanding and may lag behind code changes
- Community feedback directly shapes priorities

## Near-Term: GA Readiness

These items must be addressed before a 1.0 stable release:

### Core Stability

- Finalize the public API surface for `runtime-core`, `host`, and `orchestration`
- Lock the `AgentrailPlugin` contract
- Lock the `AgentrailSessionStore` interface
- Lock the `AgentrailProfile` / `HostedProfileDefinition` contracts
- Stabilize the event type taxonomy (`RuntimeEvent`, `AgentrailHostEvent`)

### Developer Experience

- Publish `@agentrail/testing` with official mock utilities (`MockLlmClient`, `MockRuntimeTool`)
- Improve `create-agentrail-app` templates with real LLM setup out of the box
- End-to-end integration test suite for the host layer

### Documentation

- Complete all concept, guide, and reference documentation
- Add API reference docs (generated from source)
- Launch a documentation site

## Mid-Term: Post-GA Improvements

These are planned directions after the core is stable:

### Storage Abstraction

- Define a storage-agnostic `SessionStore` interface (remove filesystem path leakage)
- Define a storage-agnostic `OrchestrationStore` interface
- Provide reference implementations for PostgreSQL and SQLite

### Scalability

- Support multiple concurrent orchestration runs per manager
- Reduce in-memory state coupling in `OrchestrationManager`
- Investigate distributed orchestration (multi-process / multi-node)

### LLM Provider System

- Replace the global singleton `LlmProviderRegistry` with instance-scoped registries
- Support per-agent and per-tenant provider configuration
- Add provider-level retry and fallback policies

### Plugin System

- Add plugin priority ordering
- Add error isolation (one plugin failure does not block others)
- Middleware-style request interceptor chain (replace first-match-wins)
- Shared context bag for inter-plugin communication

### Sub-Agent Communication

- Structured output types for sub-agent results (beyond `outputText: string`)
- Typed agent-to-agent message contracts

### Observability

- OpenTelemetry trace integration points in the agent loop and tool executor
- Structured logging with configurable log levels
- Built-in metrics (request count, token usage, tool execution latency)

## Not Planned

To set clear expectations, these are intentionally out of scope:

- Hosted cloud platform or SaaS offering
- Built-in billing or usage metering
- Proprietary model integrations beyond the provider API
- GUI-based agent builder (Agentrail is code-first)

## Contributing to the Roadmap

If you want to influence priorities or contribute to a roadmap item:

1. Open a [feature request](https://github.com/yai-dev/agentrail/issues/new?template=feature_request.md) to discuss the idea
2. Reference this roadmap in your issue for context
3. PRs for roadmap items are welcome — mention the relevant section in your PR description
