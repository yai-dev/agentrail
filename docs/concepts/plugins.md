# Plugins

Plugins extend the host layer without forcing you to modify route factories directly.

## Typical Plugin Use Cases

- intercepting chat requests
- contributing context providers
- adding attachment handling
- reacting to request lifecycle hooks
- running background services with host startup and shutdown

## Lifecycle

The host recognizes three main lifecycle callbacks for requests:

- `onRequestStart`
- `onRequestEnd`
- `onTurnPersisted`

Plugins can also expose `start` and `stop` hooks for process lifecycle.
