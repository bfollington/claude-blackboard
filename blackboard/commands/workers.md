---
description: List active worker containers
allowed-tools: Bash
---

Show the status of all running worker containers.

## Usage

```bash
blackboard workers [--all]
```

Use `--all` to include completed, failed, and killed workers.

## Related Commands

- `blackboard spawn <thread>` - Start a new worker
- `blackboard kill <id>` - Kill a specific worker
- `blackboard drain` - Stop all workers
- `blackboard farm` - Manage multiple workers
