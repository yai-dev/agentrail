#!/bin/bash
PLAYGROUND=/home/yaid/projects/personal/agentrail/examples/playground-server/src
DR=/home/yaid/projects/personal/agentrail/packages/deep-research/src

# Fix playground-server
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/runtime-core|@agentrail/core|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/memo|@agentrail/core|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/prompts|@agentrail/core|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/host/defaults|@agentrail/app|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/host|@agentrail/app|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/config|@agentrail/app|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/events|@agentrail/app|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/slash-commands|@agentrail/app|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/plugin-user-memory|@agentrail/app|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/knowledge|@agentrail/capabilities|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/sandbox|@agentrail/capabilities|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/skills|@agentrail/capabilities|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/tools|@agentrail/capabilities|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/orchestration/worker|@agentrail/capabilities/orchestration/worker|g' {} +
find "$PLAYGROUND" -name "*.ts" -exec sed -i 's|@agentrail/orchestration|@agentrail/capabilities|g' {} +

# Fix deep-research
find "$DR" -name "*.ts" -exec sed -i 's|@agentrail/runtime-core|@agentrail/core|g' {} +
find "$DR" -name "*.ts" -exec sed -i 's|@agentrail/memo|@agentrail/core|g' {} +
find "$DR" -name "*.ts" -exec sed -i 's|@agentrail/prompts|@agentrail/core|g' {} +
find "$DR" -name "*.ts" -exec sed -i 's|@agentrail/knowledge|@agentrail/capabilities|g' {} +
find "$DR" -name "*.ts" -exec sed -i 's|@agentrail/sandbox|@agentrail/capabilities|g' {} +
find "$DR" -name "*.ts" -exec sed -i 's|@agentrail/orchestration/worker|@agentrail/capabilities/orchestration/worker|g' {} +
find "$DR" -name "*.ts" -exec sed -i 's|@agentrail/orchestration|@agentrail/capabilities|g' {} +

echo "=== remaining @agentrail in playground (excluding core/capabilities/app) ==="
grep -r '@agentrail/' "$PLAYGROUND" --include="*.ts" | grep -v '@agentrail/core\|@agentrail/capabilities\|@agentrail/app\|@agentrail/deep-research' | head -10

echo "=== remaining @agentrail in deep-research (excluding core/capabilities) ==="
grep -r '@agentrail/' "$DR" --include="*.ts" | grep -v '@agentrail/core\|@agentrail/capabilities' | head -10

echo "done"
