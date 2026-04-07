#!/bin/bash
DEST=/home/yaid/projects/personal/agentrail/packages/app/src

# 1. @agentrail/runtime-core -> @agentrail/core
find "$DEST" -name "*.ts" -exec sed -i 's|@agentrail/runtime-core|@agentrail/core|g' {} +

# 2. @agentrail/memo -> @agentrail/core (for types like SessionRef, TodoStorage, MemoryIndex)
#    But some memo imports are for IMPLEMENTATION (SessionManager, etc.) which are now local
#    We need to be careful here - first do a blanket replace, then fix local refs

# Memo types that go to core: SessionRef, TodoStorage, MemoryIndex, etc.
# Memo impls that are now local: SessionManager, SessionManagerHelpers, etc.
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/memo"|from "@agentrail/core"|g' {} +
find "$DEST" -name "*.ts" -exec sed -i "s|from '@agentrail/memo'|from '@agentrail/core'|g" {} +

# 3. @agentrail/host -> local types (most host types are now in app/src/host/types.ts)
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/host"|from "@agentrail/core"|g' {} +
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/host/defaults"|from "@agentrail/capabilities"|g' {} +

# 4. @agentrail/events -> local (./events/index.js or relative)
# Events are now in app/src/events/ but they need relative imports from host/ etc.
# The host/ files import from @agentrail/events; update them to relative path
# Host is at routes/ and host/ which are in app/src/
find "$DEST/routes" -name "*.ts" -exec sed -i 's|from "@agentrail/events"|from "../events/index.js"|g' {} +
find "$DEST/host" -name "*.ts" -exec sed -i 's|from "@agentrail/events"|from "../events/index.js"|g' {} +
find "$DEST/events" -name "*.ts" -exec sed -i 's|from "@agentrail/events"|from "./index.js"|g' {} +

# 5. @agentrail/knowledge -> @agentrail/capabilities
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/knowledge"|from "@agentrail/capabilities"|g' {} +
find "$DEST" -name "*.ts" -exec sed -i "s|from '@agentrail/knowledge'|from '@agentrail/capabilities'|g" {} +

# 6. @agentrail/sandbox -> @agentrail/capabilities
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/sandbox"|from "@agentrail/capabilities"|g' {} +

# 7. @agentrail/skills -> @agentrail/capabilities
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/skills"|from "@agentrail/capabilities"|g' {} +

# 8. @agentrail/orchestration -> @agentrail/capabilities
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/orchestration"|from "@agentrail/capabilities"|g' {} +
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/orchestration/worker"|from "@agentrail/capabilities/orchestration/worker"|g' {} +

# 9. @agentrail/tools -> @agentrail/capabilities
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/tools"|from "@agentrail/capabilities"|g' {} +

# 10. @agentrail/config -> local (./config/index.js)
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/config"|from "../config/index.js"|g' {} +

# 11. @agentrail/slash-commands -> local (./commands/index.js)
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/slash-commands"|from "../commands/index.js"|g' {} +

# 12. @agentrail/plugin-user-memory -> local
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/plugin-user-memory"|from "../plugins/user-memory/index.js"|g' {} +

# 13. @agentrail/prompts -> @agentrail/core
find "$DEST" -name "*.ts" -exec sed -i 's|from "@agentrail/prompts"|from "@agentrail/core"|g' {} +

echo "=== Remaining @agentrail imports ==="
grep -r '@agentrail/' "$DEST" --include="*.ts" | grep -v '@agentrail/core\|@agentrail/capabilities\|@agentrail/capabilities/orchestration' | head -30
