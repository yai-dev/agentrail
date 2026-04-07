#!/bin/bash
DEST=/home/yaid/projects/personal/agentrail/packages/app/src

# Fix compaction import in routes (was same dir, now in ../host/)
sed -i 's|from "./compaction.js"|from "../host/compaction.js"|g' "$DEST/routes/chat-route.ts"
sed -i 's|from "./compaction.js"|from "../host/compaction.js"|g' "$DEST/routes/stream-route.ts"

# Also fix chat-route-internals and stream-route-internals
# They may import context-pipeline from ./context-pipeline.js -> ../host/context-pipeline.js
sed -i 's|from "./context-pipeline.js"|from "../host/context-pipeline.js"|g' "$DEST/routes/chat-route-internals.ts"
sed -i 's|from "./context-pipeline.js"|from "../host/context-pipeline.js"|g' "$DEST/routes/stream-route-internals.ts"

echo "routes chat-route.ts local imports:"
grep 'from "\.' "$DEST/routes/chat-route.ts"

echo "routes stream-route.ts local imports:"
grep 'from "\.' "$DEST/routes/stream-route.ts"

echo "routes chat-route-internals.ts local imports:"
grep 'from "\.' "$DEST/routes/chat-route-internals.ts"
