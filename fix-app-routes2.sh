#!/bin/bash
DEST=/home/yaid/projects/personal/agentrail/packages/app/src

# Fix remaining relative imports that are wrong
sed -i 's|from "./plugins.js"|from "../host/plugins.js"|g' "$DEST/routes/chat-route-internals.ts"
sed -i 's|from "./plugins.js"|from "../host/plugins.js"|g' "$DEST/routes/stream-route-internals.ts"

# stream-route-internals may also import context-pipeline from wrong path
sed -i 's|from "./context-pipeline.js"|from "../host/context-pipeline.js"|g' "$DEST/routes/stream-route-internals.ts"

# Check plugins.ts in host/ - it may import from "./types.js" (correct already)
# Check host/compaction.ts - it may import from routes files
echo "host/compaction.ts imports:"
grep 'from ' "$DEST/host/compaction.ts" | head -10

echo "host/orchestration-registry.ts imports:"
grep 'from ' "$DEST/host/orchestration-registry.ts" | head -10

echo "commands/index.ts imports:"
grep '@agentrail' "$DEST/commands/index.ts" 2>/dev/null | head -5

echo "plugins/user-memory imports:"
grep '@agentrail' "$DEST/plugins/user-memory/index.ts" 2>/dev/null | head -10
