#!/bin/bash
DEST=/home/yaid/projects/personal/agentrail/packages/capabilities/src

# Replace all @agentrail/runtime-core imports with @agentrail/core
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/runtime-core"|from "@agentrail/core"|g' {} +
find "$DEST" -name "*.ts" -exec sed -i "s|from '@agentrail/runtime-core'|from '@agentrail/core'|g" {} +

# Replace @agentrail/memo imports with @agentrail/core (session types moved there)
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/memo"|from "@agentrail/core"|g' {} +
find "$DEST" -name "*.ts" -exec sed -i "s|from '@agentrail/memo'|from '@agentrail/core'|g" {} +

# Fix internal imports: each sub-package now uses relative paths within capabilities/src/
# sandbox tools that previously imported from @agentrail/runtime-core - already fixed above

# memory/index.ts imports from @agentrail/host - needs to be updated to @agentrail/core types
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/host"|from "@agentrail/core"|g' {} +
find "$DEST" -name "*.ts" -exec sed -i "s|from '@agentrail/host'|from '@agentrail/core'|g" {} +

echo "Import replacements done"

# Show remaining agentrail imports to check for any missed ones
echo "--- remaining @agentrail imports ---"
grep -r '@agentrail/' "$DEST" --include="*.ts" | grep -v 'node_modules' | head -30
