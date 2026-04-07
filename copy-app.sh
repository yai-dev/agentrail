#!/bin/bash
BASE=/home/yaid/projects/personal/agentrail/packages
DEST=$BASE/app/src

mkdir -p "$DEST/routes" "$DEST/session" "$DEST/commands" "$DEST/config" \
         "$DEST/events" "$DEST/host" "$DEST/plugins/user-memory" \
         "$DEST/profile" "$DEST/app"

# host/src -> routes/ (route files) and host/ (internals)
cp $BASE/host/src/chat-route.ts          "$DEST/routes/"
cp $BASE/host/src/chat-route-internals.ts "$DEST/routes/"
cp $BASE/host/src/stream-route.ts        "$DEST/routes/"
cp $BASE/host/src/stream-route-internals.ts "$DEST/routes/"
cp $BASE/host/src/compaction.ts          "$DEST/host/"
cp $BASE/host/src/context-pipeline.ts   "$DEST/host/"
cp $BASE/host/src/orchestration-registry.ts "$DEST/host/"
cp $BASE/host/src/plugins.ts            "$DEST/host/"
cp $BASE/host/src/profile-registry.ts   "$DEST/host/"
cp $BASE/host/src/types.ts              "$DEST/host/"

# host/src/defaults -> host/defaults/
mkdir -p "$DEST/host/defaults"
cp -r $BASE/host/src/defaults/. "$DEST/host/defaults/"

# memo/src (implementation files) -> session/
cp $BASE/memo/src/session-manager.ts         "$DEST/session/"
cp $BASE/memo/src/session-manager-helpers.ts "$DEST/session/"
cp $BASE/memo/src/compaction.ts              "$DEST/session/"
cp $BASE/memo/src/token-estimator.ts         "$DEST/session/"
cp $BASE/memo/src/trace-store.ts             "$DEST/session/"

# memo/src (index) for reference
# events/src -> events/
cp $BASE/events/src/index.ts "$DEST/events/"

# config/src -> config/
cp $BASE/config/src/index.ts "$DEST/config/"

# slash-commands/src -> commands/
cp -r $BASE/slash-commands/src/. "$DEST/commands/"

# plugin-user-memory/src -> plugins/user-memory/
cp -r $BASE/plugin-user-memory/src/. "$DEST/plugins/user-memory/"

echo "Done:"
ls "$DEST"
