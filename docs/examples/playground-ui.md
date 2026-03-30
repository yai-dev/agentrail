# Playground UI Example

## Why Read This Example

Read this page if you want to understand how the browser-side playground consumes Agentrail host routes and event streams.

This example is useful because it shows:

- how a client can talk to both the `chat` and `stream` host entry points
- how a UI can render session-oriented agent interactions without owning framework runtime logic
- how to keep application presentation concerns separate from host, profile, and plugin wiring

## What This Example Demonstrates

The playground UI is not a framework package. It is an example client application that sits on top of Agentrail-hosted routes.

It demonstrates:

- request/response chat interactions
- streamed event consumption
- session and turn browsing
- orchestration and workflow visibility in a user-facing interface

It does **not** define framework contracts. It exists to show what it feels like to consume those contracts from a browser client.

## Main Files To Read

Start with these files:

- app shell:
  - [examples/playground-ui/src/App.tsx](../../examples/playground-ui/src/App.tsx)
- API integration:
  - [examples/playground-ui/src/api.ts](../../examples/playground-ui/src/api.ts)
- UI components:
  - [examples/playground-ui/src/components](../../examples/playground-ui/src/components)
- hooks:
  - [examples/playground-ui/src/hooks](../../examples/playground-ui/src/hooks)
- entry point:
  - [examples/playground-ui/src/main.tsx](../../examples/playground-ui/src/main.tsx)

## What Is Framework-Level vs Example-Level

Framework-level pieces consumed by this example:

- the `chat` and `stream` routes exposed by `@agentrail/host`
- the event shapes surfaced by Agentrail host and orchestration flows
- the session-oriented model used by the example server

Example-level pieces specific to this UI:

- component composition and page layout
- local state and interaction design
- request triggering and response rendering
- visual treatment of streamed progress and workflow state

## How To Read It

If you want to understand the end-to-end loop, read in this order:

1. [Examples: Playground Server](playground-server.md)
2. [examples/playground-ui/src/api.ts](../../examples/playground-ui/src/api.ts)
3. [examples/playground-ui/src/App.tsx](../../examples/playground-ui/src/App.tsx)
4. [Reference: Events](../reference/events.md)

That path makes it easier to see how host events become UI state.

## Next Step

Continue with:

- [Examples: Playground Server](playground-server.md)
- [Reference: Events](../reference/events.md)
- [Concepts: Host](../concepts/host.md)
