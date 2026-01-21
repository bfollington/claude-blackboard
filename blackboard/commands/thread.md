---
description: Load a thread context for continued work
argument-hint: <name>
allowed-tools: Bash
---

Load a thread and its full context for continued work.

Run:
```bash
blackboard hook load-thread $ARGUMENTS
```

The output contains the thread's current state including:
- Current plan (if any)
- Steps and their status
- Recent breadcrumbs
- Open issues
- Orchestration instructions

Follow the orchestration instructions in the output to continue work on this thread.

If the thread doesn't exist, inform the user and suggest creating it with:
`blackboard thread new <name>`
