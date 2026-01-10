---
description: Record a correction or mistake for future reference
argument-hint: <mistake> [--symptoms <what you saw>] [--fix <how to fix>] [--tags <tag1,tag2>]
allowed-tools: Bash
---

Record a mistake or wrong approach so future agents can learn from it.

## Instructions

Parse the arguments and record the correction.

Arguments: $ARGUMENTS

Expected format:
- First positional argument or text before flags: the mistake description
- `--symptoms <text>`: error messages, unexpected behavior that indicated the problem
- `--fix <text>`: the correct approach or resolution
- `--tags <list>`: comma-separated categories (e.g., "typescript,imports,circular-dependency")

Run the oops script:
```bash
"$(.claude/cpr.sh blackboard)/scripts/oops.sh" "<mistake>" --symptoms "<symptoms>" --fix "<fix>" --tags "<tags>"
```

Omit flags that weren't provided. Escape quotes properly.

## Why This Matters

Future agents can query this table to:
- Avoid repeating the same mistakes
- Recognize error patterns and their solutions
- Learn from the collective experience across sessions
