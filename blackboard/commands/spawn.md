---
description: Spawn a worker container for a thread
argument-hint: <thread-name>
allowed-tools: Bash
---

Spawn a Docker container worker to execute a thread's pending steps using the Ralph Wiggum loop pattern.

## Usage

Run the blackboard spawn command:

```bash
blackboard spawn <thread-name> [--auth env|config] [--build] [--repo <path>]
```

Options:
- `--auth env` (default): Pass ANTHROPIC_API_KEY as environment variable
- `--auth config`: Mount ~/.claude config directory
- `--build`: Build the worker Docker image before spawning
- `--repo <path>`: Git workspace to mount (default: current directory)
- `--max-iterations <n>`: Max Claude CLI iterations (default: 50)
- `--image <name>`: Worker image name (default: blackboard-worker:latest)

## Prerequisites

- Docker must be running (OrbStack, Docker Desktop, or Colima)
- Thread must exist and be active or paused
- For --auth env: ANTHROPIC_API_KEY must be set
