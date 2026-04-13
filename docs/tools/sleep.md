# `Sleep`

Pause agent execution for a bounded number of milliseconds.

**Package:** `@agentrail/capabilities`

## Parameters

| Name          | Type      | Required | Description                                      |
| ------------- | --------- | -------- | ------------------------------------------------ |
| `duration_ms` | `integer` | Yes      | How long to sleep in milliseconds. Minimum: `0`. |

## Result

```ts
{
  requestedMs: number;
  appliedMs: number;
  maxMs: number;
  wasClamped: boolean;
}
```

The actual sleep duration is clamped to `maxMs` (defaults to `30000` ms). If the requested duration exceeds the cap, `wasClamped` is `true` and the response text describes the adjustment.

## Factory options

`createSleepTool(options)` accepts:

| Option  | Type     | Description                                                 |
| ------- | -------- | ----------------------------------------------------------- |
| `maxMs` | `number` | Maximum allowed sleep in milliseconds. Defaults to `30000`. |

## Abort behavior

If the agent run is cancelled or aborted while sleeping, the sleep is interrupted immediately and the tool throws `"Sleep aborted"`.

## Usage notes

- Use short waits and re-check state between calls rather than a single long pause.
- Useful for polling loops, retry backoff, rate-limit compliance, and waiting for external side effects to settle.
- Do not use `Sleep` when `Bash` with a long-running process is a better fit — use `timeout: 0` on `Bash` instead.

## Example

```ts
// Wait 2 seconds before retrying
{
  duration_ms: 2000;
}

// Pause briefly while waiting for a file to appear
{
  duration_ms: 500;
}
```

## Related

- [Bash](bash.md)
