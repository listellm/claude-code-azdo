#!/bin/bash
# Updates vss-extension.json and task.json to match the given version.
# Called by @semantic-release/exec during the prepare step.
# Usage: ./scripts/update-azure-versions.sh <version>
set -e

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Error: version argument required" >&2
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$PROJECT_ROOT/vss-extension.json"

sed -i "s/\"Major\": [0-9]*/\"Major\": $MAJOR/" "$PROJECT_ROOT/task.json"
sed -i "s/\"Minor\": [0-9]*/\"Minor\": $MINOR/" "$PROJECT_ROOT/task.json"
sed -i "s/\"Patch\": [0-9]*/\"Patch\": $PATCH/" "$PROJECT_ROOT/task.json"

echo "Updated vss-extension.json and task.json to $VERSION"
