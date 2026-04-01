---
"@agentrail/runtime-core": minor
---

Make `LlmProviderRegistry` instantiable and add `llmClient` injection to `AgentConfig`.

- `LlmProviderRegistry`: constructor is no longer `private`, allowing callers to create independent instances without sharing the global singleton. `getInstance()` and `resetInstance()` are preserved for backward compatibility.
- `AgentConfig`: new optional `llmClient?: LlmClient` field for injecting a client directly into an agent definition.
- `AgentImpl`: uses the injected client in `stream()` when provided, falling back to `new DefaultLlmClient()` when not — existing behavior is unchanged.
