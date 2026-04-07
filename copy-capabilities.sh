#!/bin/bash
BASE=/home/yaid/projects/personal/agentrail/packages
DEST=$BASE/capabilities/src

mkdir -p "$DEST/sandbox" "$DEST/knowledge" "$DEST/skills" "$DEST/orchestration" "$DEST/tools" "$DEST/memory"

cp -r "$BASE/sandbox/src/." "$DEST/sandbox/"
cp -r "$BASE/knowledge/src/." "$DEST/knowledge/"
cp -r "$BASE/skills/src/." "$DEST/skills/"
cp -r "$BASE/orchestration/src/." "$DEST/orchestration/"
cp -r "$BASE/tools/src/." "$DEST/tools/"
cp -r "$BASE/plugin-user-memory/src/." "$DEST/memory/"

echo "Copied successfully:"
ls "$DEST"
