#!/bin/bash
BASE=/home/yaid/projects/personal/agentrail/packages
DEST=$BASE/capabilities/src

# Remove wrongly placed plugin-user-memory files
rm -f "$DEST/memory/index.ts" "$DEST/memory/user-memory-consolidation-service.ts"

# Copy capability-context and capability-messages from host/defaults
cp "$BASE/host/src/defaults/capability-context.ts" "$DEST/memory/context.ts"
cp "$BASE/host/src/defaults/capability-messages.ts" "$DEST/memory/messages.ts"

# Copy context-pipeline (utility for ContextProvider <-> TransformContextFn)
cp "$BASE/host/src/context-pipeline.ts" "$DEST/context-pipeline.ts"

echo "done"
echo "memory dir:"
ls "$DEST/memory/"
echo "root:"
ls "$DEST/"
