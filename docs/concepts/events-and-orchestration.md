# Events and Orchestration

Agentrail uses events for observability and orchestration for delegated work.

## Events

Hosts emit runtime and lifecycle events so UIs and integrations can observe execution as it happens.

## Orchestration

The orchestration layer manages:

- spawning sub-agents
- sending inputs
- waiting for conditions
- recovering state

This is how advanced workflows such as Deep Research are built on top of the framework.
