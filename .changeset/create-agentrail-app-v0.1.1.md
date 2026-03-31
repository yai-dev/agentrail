---
"@agentrail/create-agentrail-app": patch
---

Fix missing shebang line causing CLI to fail on execution

Added `#!/usr/bin/env node` as the first line of `src/index.ts` so the compiled `dist/index.js` is correctly identified as a Node.js script by the OS. Without this, running `npx @agentrail/create-agentrail-app` failed with "Permission denied" and "Syntax error" because the shell tried to interpret the JavaScript file as a shell script.
