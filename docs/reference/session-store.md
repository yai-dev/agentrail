# Session Store Reference

The host layer depends on the `AgentrailSessionStore` contract rather than a concrete storage implementation.

## When To Read This Page

Read this page when:

- you want to replace the default filesystem-backed session manager
- you need to understand what the host actually requires from storage
- you are designing persistence boundaries for a custom host

## Responsibilities

- create or resume sessions
- resolve session directories
- load message history
- append messages
- record usage
- compact history when needed

The default examples use the filesystem-backed session manager from `@agentrail/memo`.
