FROM node:22-slim

# Install system dependencies (git, curl, unzip needed for Deno installer)
RUN apt-get update && apt-get install -y git curl unzip sudo && rm -rf /var/lib/apt/lists/*

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

# Create non-root worker user (Claude CLI rejects --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash worker && \
    mkdir -p /app/repo /app/db /app/work && \
    chown -R worker:worker /app && \
    cp -r /root/.deno /home/worker/.deno && \
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
