#!/bin/bash
DEST=/home/yaid/projects/personal/agentrail/packages/app/src

# Fix routes/ files that import from old sibling paths
# They now import from ../host/ instead of ./

# routes/chat-route.ts imports "./types.js", "./compaction.js", "./plugins.js"
sed -i 's|from "\./types\.js"|from "../host/types.js"|g' "$DEST/routes/chat-route.ts"
sed -i 's|from "\./compaction\.js"|from "./compaction.js"|g' "$DEST/routes/chat-route.ts"
sed -i 's|from "\./plugins\.js"|from "../host/plugins.js"|g' "$DEST/routes/chat-route.ts"
sed -i 's|from "\./chat-route-internals\.js"|from "./chat-route-internals.js"|g' "$DEST/routes/chat-route.ts"

# routes/chat-route-internals.ts imports "./types.js", "./context-pipeline.js"
sed -i 's|from "\./types\.js"|from "../host/types.js"|g' "$DEST/routes/chat-route-internals.ts"
sed -i 's|from "\./context-pipeline\.js"|from "../host/context-pipeline.js"|g' "$DEST/routes/chat-route-internals.ts"

# routes/stream-route.ts imports "./types.js", "./compaction.js", "./plugins.js"
sed -i 's|from "\./types\.js"|from "../host/types.js"|g' "$DEST/routes/stream-route.ts"
sed -i 's|from "\./compaction\.js"|from "./compaction.js"|g' "$DEST/routes/stream-route.ts"
sed -i 's|from "\./plugins\.js"|from "../host/plugins.js"|g' "$DEST/routes/stream-route.ts"
sed -i 's|from "\./stream-route-internals\.js"|from "./stream-route-internals.js"|g' "$DEST/routes/stream-route.ts"

# routes/stream-route-internals.ts imports "./types.js", "./context-pipeline.js"
sed -i 's|from "\./types\.js"|from "../host/types.js"|g' "$DEST/routes/stream-route-internals.ts"
sed -i 's|from "\./context-pipeline\.js"|from "../host/context-pipeline.js"|g' "$DEST/routes/stream-route-internals.ts"

# host/compaction.ts imports from local types
sed -i 's|from "\./types\.js"|from "./types.js"|g' "$DEST/host/compaction.ts"

# host/context-pipeline.ts imports from "./types.js"
sed -i 's|from "\./types\.js"|from "./types.js"|g' "$DEST/host/context-pipeline.ts"

# host/plugins.ts imports from "./types.js"
sed -i 's|from "\./types\.js"|from "./types.js"|g' "$DEST/host/plugins.ts"

# host/profile-registry.ts imports from "./types.js"
sed -i 's|from "\./types\.js"|from "./types.js"|g' "$DEST/host/profile-registry.ts"

# host/orchestration-registry.ts may also import from "./types.js"
sed -i 's|from "\./types\.js"|from "./types.js"|g' "$DEST/host/orchestration-registry.ts"

# host/defaults/*.ts imports from "../types.js" -> "../types.js" (already correct since defaults is a subdir)
# But we need to check: in old host/src/defaults/, "../types.js" was host/src/types.js -> now host/types.js
# After copy to app/src/host/defaults/, "../types.js" = app/src/host/types.js ✓

# host/defaults/*.ts imports from "./shared-types.js" -> relative, correct
# host/defaults/*.ts imports from "./toolset.js" -> relative, correct  
# host/defaults/*.ts imports from "./capability-tools.js" -> relative, correct

# Fix host/types.ts: AgentrailSessionStore is now re-exported from @agentrail/core
# (currently it defines it locally, which is fine for now - just needs type compat)

# session/session-manager.ts may import from ../index.js or @agentrail/memo
# Let's check what's there
echo "=== session/ imports ==="
grep -r 'from' "$DEST/session/" --include="*.ts" | grep -v 'node:' | head -30

echo "=== host/defaults imports ==="
grep -r 'from' "$DEST/host/defaults/" --include="*.ts" | grep '"\.\./' | head -20

echo "=== Done ==="
