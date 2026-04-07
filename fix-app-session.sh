#!/bin/bash
DEST=/home/yaid/projects/personal/agentrail/packages/app/src

# session/ files still import from "./session-ref.js", "./types.js", "./todo-storage.js"
# because those are copies of memo types that now live in @agentrail/core

# Fix session-manager.ts
sed -i 's|from "\./session-ref\.js"|from "@agentrail/core"|g' "$DEST/session/session-manager.ts"
sed -i 's|from "\./todo-storage\.js"|from "@agentrail/core"|g' "$DEST/session/session-manager.ts"
sed -i 's|from "\./types\.js"|from "@agentrail/core"|g' "$DEST/session/session-manager.ts"

# Fix trace-store.ts
sed -i 's|from "\./session-ref\.js"|from "@agentrail/core"|g' "$DEST/session/trace-store.ts"

# Fix session-manager-helpers.ts
sed -i 's|from "\./types\.js"|from "@agentrail/core"|g' "$DEST/session/session-manager-helpers.ts"

# Fix compaction.ts (if it has similar refs)
sed -i 's|from "\./session-ref\.js"|from "@agentrail/core"|g' "$DEST/session/compaction.ts"
sed -i 's|from "\./types\.js"|from "@agentrail/core"|g' "$DEST/session/compaction.ts"

# Fix memo index.ts (if it exists)
[ -f "$DEST/session/index.ts" ] && sed -i 's|from "\./session-ref\.js"|from "@agentrail/core"|g' "$DEST/session/index.ts"

# Also fix host/defaults/capability-messages.ts which was also copied
# and has @agentrail/memo replaced with @agentrail/core - check for MemoryIndex imports
sed -i 's|from "@agentrail/capabilities/orchestration/worker"|from "@agentrail/capabilities"|g' "$DEST/host/defaults/capability-messages.ts" 2>/dev/null || true

# events/index.ts may import from @agentrail/orchestration -> now @agentrail/capabilities
# already handled in fix-app-imports.sh

# Check what's left in host/defaults/
echo "=== host/defaults imports (all agentrail) ==="
grep -r '@agentrail' "$DEST/host/defaults/" --include="*.ts"

echo "=== session/ remaining local imports ==="
grep -r 'from "\.' "$DEST/session/" --include="*.ts"

echo "=== Done ==="
