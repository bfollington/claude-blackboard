---
description: File a blocking bug report with reproduction steps
argument-hint: <title> --steps <repro steps> [--evidence <logs/screenshots>]
allowed-tools: Bash
---

File a bug report for a blocking issue.

## CRITICAL RULES

Include ONLY:
- **Title**: A concise description of the bug
- **Reproduction steps**: Precise, numbered steps to reproduce
- **Evidence**: Logs, error messages, observable behavior

Do NOT include:
- Speculation about the cause
- Guesses about the fix
- Theories about what might be wrong

Speculation creates red herrings that waste time. Stick to observable facts.

## Instructions

Parse the arguments:

Arguments: $ARGUMENTS

Expected format:
- First positional argument: title
- `--steps <text>`: reproduction steps (required)
- `--evidence <text>`: logs, error messages, etc.

Run the bug-report script:
```bash
"$CLAUDE_PROJECT_DIR/.claude/scripts/bug-report.sh" "<title>" --steps "<steps>" --evidence "<evidence>"
```

Omit --evidence if not provided. Escape quotes properly.

## After Filing

Once a bug report is filed, STOP working on that task. Do not attempt to fix it speculatively. The bug report exists so a human can investigate or so a future agent with fresh context can approach it.
