/**
 * Init-worker command - Create a project-specific Dockerfile.worker template.
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";

export interface InitWorkerOptions {
  db?: string;
  quiet?: boolean;
  force?: boolean;
}

const DOCKERFILE_TEMPLATE = `# Project-specific worker Dockerfile
# Extends the base blackboard worker image with project dependencies

FROM node:22-slim

# Install system dependencies (git, curl, unzip needed for Deno installer, xxd for entrypoint)
RUN apt-get update && apt-get install -y git curl unzip sudo xxd && rm -rf /var/lib/apt/lists/*

# Install Deno (as root, then move to shared location)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Copy blackboard CLI source and schema
COPY blackboard/cli /app/blackboard-cli
COPY blackboard/schema.sql /app/schema.sql

# Copy entrypoint
COPY blackboard/docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set up .claude directory structure with subagent definitions
RUN mkdir -p /app/claude-config/agents
COPY blackboard/agents/implementer.md /app/claude-config/agents/implementer.md

# ============================================================
# PROJECT-SPECIFIC DEPENDENCIES
# ============================================================
# Add your project's language runtimes, package managers, and build tools here.
# Examples:
#
# Python:
#   RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*
#   COPY requirements.txt /tmp/
#   RUN pip3 install -r /tmp/requirements.txt
#
# Rust:
#   RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
#   ENV PATH="/root/.cargo/bin:$PATH"
#
# Go:
#   RUN wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz && \\
#       tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz && \\
#       rm go1.21.5.linux-amd64.tar.gz
#   ENV PATH="/usr/local/go/bin:$PATH"
#
# Node.js project dependencies:
#   COPY package.json package-lock.json /app/project/
#   WORKDIR /app/project
#   RUN npm ci
#   WORKDIR /app/repo
# ============================================================

# Create non-root worker user (Claude CLI rejects --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash worker && \\
    mkdir -p /app/repo /app/db /app/work && \\
    chown -R worker:worker /app && \\
    cp -r /root/.deno /home/worker/.deno && \\
    chown -R worker:worker /home/worker/.deno

# Install blackboard CLI as worker user (so config paths resolve correctly)
USER worker
WORKDIR /app/blackboard-cli
RUN /home/worker/.deno/bin/deno task install

# Cache the SQLite native library at build time
RUN /home/worker/.deno/bin/deno eval "import '@db/sqlite';" || true

ENV CLAUDE_PROJECT_DIR=/app/work
ENV CLAUDE_PLUGIN_ROOT=/app
ENV DENO_INSTALL="/home/worker/.deno"
ENV PATH="/home/worker/.deno/bin:$PATH"
WORKDIR /app/repo
USER worker
ENTRYPOINT ["/app/entrypoint.sh"]
`;

/**
 * Create a project-specific Dockerfile.worker template.
 */
export async function initWorkerCommand(options: InitWorkerOptions): Promise<void> {
  const projectRoot = Deno.cwd();
  const dockerfilePath = join(projectRoot, "Dockerfile.worker");

  // Check if Dockerfile.worker already exists
  try {
    await Deno.stat(dockerfilePath);
    if (!options.force) {
      console.error(`Error: ${dockerfilePath} already exists.`);
      console.error("Use --force to overwrite.");
      Deno.exit(1);
    }
  } catch {
    // File doesn't exist, proceed
  }

  // Write the template
  try {
    await Deno.writeTextFile(dockerfilePath, DOCKERFILE_TEMPLATE);

    if (!options.quiet) {
      console.log(`Created ${dockerfilePath}`);
      console.log("\nNext steps:");
      console.log("1. Edit Dockerfile.worker to add your project's dependencies");
      console.log("2. Build the image: blackboard spawn <thread-name> --build");
      console.log("\nThe worker will use this Dockerfile instead of the default.");
    }
  } catch (error) {
    console.error(
      `Error writing Dockerfile: ${error instanceof Error ? error.message : String(error)}`
    );
    Deno.exit(1);
  }
}
