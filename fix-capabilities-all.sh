#!/bin/bash
DEST=/home/yaid/projects/personal/agentrail/packages/capabilities/src

# 1. @agentrail/runtime-core -> @agentrail/core
find "$DEST" -name "*.ts" -exec sed -i 's|@agentrail/runtime-core|@agentrail/core|g' {} +

# 2. @agentrail/memo -> @agentrail/core
find "$DEST" -name "*.ts" -exec sed -i 's|@agentrail/memo|@agentrail/core|g' {} +

# 3. @agentrail/host -> @agentrail/core (temporary; will be fixed per-file below)
find "$DEST" -name "*.ts" -exec sed -i 's|@agentrail/host|@agentrail/core|g' {} +

# 4. In context-pipeline.ts: fix import from "./types.js" -> use @agentrail/core
sed -i 's|from "\./types\.js"|from "@agentrail/core"|g' "$DEST/context-pipeline.ts"

# 5. In memory/context.ts: fix all the paths
# - "./capability-messages.js" -> "./messages.js"
sed -i 's|\./capability-messages\.js|./messages.js|g' "$DEST/memory/context.ts"
# - "./shared-types.js" -> "./types.js" (local types we'll create)
sed -i 's|\./shared-types\.js|./types.js|g' "$DEST/memory/context.ts"
# - "../types.js" -> @agentrail/core
sed -i 's|from "\.\./types\.js"|from "@agentrail/core"|g' "$DEST/memory/context.ts"
# - "./toolset.js" -> "./types.js" (we'll inline createDefaultContextProviders)
sed -i 's|from "\./toolset\.js"|from "./types.js"|g' "$DEST/memory/context.ts"

# 6. In memory/messages.ts: fix imports from @agentrail/knowledge -> relative, @agentrail/skills -> relative
sed -i 's|from "@agentrail/knowledge"|from "../knowledge/types.js"|g' "$DEST/memory/messages.ts"
sed -i 's|from "@agentrail/skills"|from "../skills/types.js"|g' "$DEST/memory/messages.ts"

# 7. In skills/skill-tools.ts: fix @agentrail/core/providers reference
sed -i 's|"@agentrail/runtime-core/providers"|"@agentrail/core/providers"|g' "$DEST/skills/skill-tools.ts"

echo "=== Remaining @agentrail imports (excluding @agentrail/core) ==="
grep -r '@agentrail/' "$DEST" --include="*.ts" | grep -v '@agentrail/core' | grep -v 'node_modules' | head -20
