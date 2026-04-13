# `Python`

Execute Python code inside the isolated sandbox environment.

**Package:** `@agentrail/capabilities` (sandbox-only)

> This tool is available only when the sandboxed capability set is active. It requires a running sandbox container.

## Parameters

| Name                    | Type       | Required | Description                                                                                                                                                                                        |
| ----------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                  | `string`   | Yes      | Python code to execute. Use `print(...)` to surface important results.                                                                                                                             |
| `working_directory`     | `string`   | No       | Sandbox working directory. Must start with `/workspace`. Defaults to `/workspace`.                                                                                                                 |
| `timeout`               | `integer`  | No       | Maximum execution time in milliseconds. Defaults to `60000`.                                                                                                                                       |
| `expected_output_files` | `string[]` | No       | Absolute sandbox paths expected to be created or updated. The current sandboxed Python tool is optimized for artifact workflows that typically write under `/workspace/.deep-research/artifacts/`. |

## Result

Returns combined stdout and stderr as text with an exit code suffix. The `details` field:

```ts
{
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  scriptPath: string;    // sandbox path of the generated script file
  outputFiles: string[]; // paths of new/modified artifact files detected after execution
}
```

The current sandboxed Python tool automatically detects changed files under `/workspace/.deep-research/artifacts/` and includes them in `outputFiles`, alongside any paths listed in `expected_output_files`. That path is the current implementation detail of this tool, not a general Agentrail-wide artifact convention.

## Usage notes

- Only packages preinstalled in the sandbox image are available. Do not attempt `pip install` without verifying sandbox image contents.
- If you want automatic artifact detection, save generated charts, tables, and data files under `/workspace/.deep-research/artifacts/`, which is the directory this tool currently scans by default.
- The script is written to `/workspace/.deep-research/tmp/` before execution and cleaned up automatically.
- Use `working_directory` to control the script's cwd (useful for relative imports).
- `expected_output_files` helps the tool report output even when mtime detection is unreliable.

## Example

```ts
// Generate a summary table from CSV data
{
  code: `
import csv, json
with open('/workspace/data.csv') as f:
    rows = list(csv.DictReader(f))
print(json.dumps(rows[:5], indent=2))
`,
  expected_output_files: []
}

// Generate a chart saved as an artifact
{
  code: `
import matplotlib.pyplot as plt
plt.plot([1,2,3],[4,5,6])
plt.savefig('/workspace/.deep-research/artifacts/chart.png')
print('Chart saved.')
`,
  expected_output_files: ["/workspace/.deep-research/artifacts/chart.png"]
}
```

## Related

- [Bash](bash.md)
- [Read](read.md)
- [Write](write.md)
