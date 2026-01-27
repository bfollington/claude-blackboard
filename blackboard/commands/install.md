---
description: Install or update the blackboard CLI
allowed-tools: Bash
---

Install or update the blackboard CLI for the user.

## Step 1: Check for Deno

First, check if Deno is installed:

```bash
deno --version
```

If Deno is not installed, inform the user they need to install it from https://deno.land before proceeding.

## Step 2: Locate the CLI directory

The CLI lives in the plugin's **marketplaces** directory (the live source), NOT the cache directory (which contains versioned snapshots that may be outdated).

Find the blackboard plugin root by searching for its `.claude-plugin` directory:

```bash
find ~/.claude/plugins/marketplaces -path "*claude-blackboard/.claude-plugin" -type d 2>/dev/null
```

If not found at user scope, check project scope:

```bash
find .claude/plugins -path "*claude-blackboard/.claude-plugin" -type d 2>/dev/null
```

The CLI directory is at `blackboard/cli` relative to the directory containing `.claude-plugin`. For example, if you find:
- `~/.claude/plugins/marketplaces/claude-blackboard/.claude-plugin`

Then the CLI is at:
- `~/.claude/plugins/marketplaces/claude-blackboard/blackboard/cli`

**CRITICAL:** Never install from `~/.claude/plugins/cache/` - that directory contains versioned snapshots from when the plugin was first installed and won't have the latest updates.

## Step 3: Run the install task

From the CLI directory, run:

```bash
deno task install
```

This executes a global Deno install with the required permissions.

## Step 4: Verify installation

Confirm the installation succeeded:

```bash
blackboard --version
```

Report the installed version to the user, or troubleshoot any errors that occurred.
