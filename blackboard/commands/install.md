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

Find the blackboard CLI directory. It should be at `blackboard/cli` relative to the blackboard plugin root (where this command file lives). The plugin root can be found by looking for the `.claude-plugin` directory.

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
