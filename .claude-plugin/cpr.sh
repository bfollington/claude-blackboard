#!/usr/bin/env bash
# Claude Plugin Root resolver - workaround for GitHub #9354
# Usage: $(.claude/cpr.sh <plugin-name>)/scripts/foo.sh

PLUGIN_NAME="${1:-blackboard}"
REGISTRY="$HOME/.claude/plugins/installed_plugins.json"

# Try CLAUDE_PLUGIN_ROOT first (for when bug is fixed)
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
  echo "$CLAUDE_PLUGIN_ROOT"
  exit 0
fi

# Look up in installed plugins registry
if [[ -f "$REGISTRY" ]] && command -v jq &>/dev/null; then
  PLUGIN_PATH=$(jq -r --arg name "$PLUGIN_NAME" '.[] | select(.name == $name) | .source' "$REGISTRY" 2>/dev/null)
  if [[ -n "$PLUGIN_PATH" && "$PLUGIN_PATH" != "null" ]]; then
    echo "$PLUGIN_PATH"
    exit 0
  fi
fi

# Fallback: assume we're in dev mode with plugin in current project
if [[ -d "${CLAUDE_PROJECT_DIR:-$PWD}/$PLUGIN_NAME" ]]; then
  echo "${CLAUDE_PROJECT_DIR:-$PWD}/$PLUGIN_NAME"
  exit 0
fi

echo "ERROR: Cannot resolve plugin path for $PLUGIN_NAME" >&2
exit 1
