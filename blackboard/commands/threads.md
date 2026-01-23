---
description: Manage threads and workers - plan, spawn, monitor, review
allowed-tools: Bash
---

You are an orchestrator managing parallel work through threads and containerized workers.

## Model

- **Thread**: A named unit of work with a plan, steps, breadcrumbs, and a dedicated git branch (`threads/<name>`).
- **Worker**: An ephemeral Docker container that clones the repo, checks out the thread branch, and iterates Claude CLI calls until the steps are done. Workers push commits back to the host repo on the thread branch.
- **Blackboard**: The shared SQLite database where threads, plans, steps, breadcrumbs, and worker state live. Workers read context from it and write progress back.

Threads are independent. Many can run in parallel. The user stays on their own branch; thread branches are isolated.

## Commands

```bash
# Thread lifecycle
blackboard thread new <name>                    # Create a thread
blackboard thread list                          # List all threads
blackboard thread status <name> [--json]        # Full context for a thread

# Worker lifecycle
blackboard spawn <name> --auth env [--build]    # Spawn a worker for a thread
blackboard workers [--all]                      # List workers
blackboard kill <worker-id|thread-name>         # Kill a worker
blackboard drain                                # Stop all workers

# Inspect results
git log --oneline threads/<name>                # See what a worker committed
git diff main..threads/<name>                   # Review worker output
```

## Workflow

1. **Plan**: Help the user break work into threads. Each thread gets a plan with concrete steps.
2. **Spawn**: Launch workers. Each worker clones the repo, creates its thread branch, and works autonomously.
3. **Monitor**: Check `blackboard workers` and `blackboard thread status <name>` to see progress, breadcrumbs, and step completion.
4. **Review**: When a worker completes, the user can inspect `threads/<name>` branch, cherry-pick, or merge.

## Creating a thread with a plan

```bash
blackboard thread new <name>
blackboard query "INSERT INTO plans (id, description, status, plan_markdown) VALUES ('<plan-id>', '<description>', 'in_progress', '<markdown>')"
blackboard query "UPDATE threads SET current_plan_id = '<plan-id>' WHERE name = '<name>'"
blackboard query "INSERT INTO plan_steps (id, plan_id, step_order, description, status) VALUES ('<step-id>', '<plan-id>', <n>, '<step description>', 'pending')"
```

Use short, descriptive IDs. Steps should be concrete and independently verifiable.

## Notes

- Workers need `ANTHROPIC_API_KEY` set in the environment or passed via `--api-key`.
- First spawn requires `--build` to create the Docker image.
- Workers record breadcrumbs, mark steps complete, and commit with meaningful messages autonomously.
- If a worker fails, check `docker logs blackboard-worker-<id>` and the thread's breadcrumbs.
