#!/usr/bin/env bash
set -euo pipefail

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
  cat <<'EOF'
{
  "systemMessage": "## Deno Required\n\nThe blackboard plugin requires Deno. Install it:\n\n```bash\ncurl -fsSL https://deno.land/install.sh | sh\n```\n\nThen add to PATH:\n```bash\nexport PATH=\"$HOME/.deno/bin:$PATH\"\n```"
}
EOF
  exit 0
fi

# Check if blackboard CLI is installed
if ! command -v blackboard &> /dev/null; then
  PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$0")/..}"
  cat <<EOF
{
  "systemMessage": "## Blackboard CLI Not Found\n\nThe blackboard plugin requires the \`blackboard\` CLI. Install it:\n\n\`\`\`bash\ndeno install -g --name blackboard --config ${PLUGIN_ROOT}/blackboard-cli/deno.json --allow-read --allow-write --allow-env --allow-ffi ${PLUGIN_ROOT}/blackboard-cli/mod.ts\n\`\`\`\n\nEnsure ~/.deno/bin is in your PATH, then restart your session."
}
EOF
  exit 0
fi

# All good, exit silently
exit 0
