FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git curl python3 make g++ ca-certificates \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@latest
RUN npm install -g @anthropic-ai/claude-code

# Create a non-root user — required for --dangerously-skip-permissions
RUN useradd -m -s /bin/bash claudeuser \
  && mkdir -p /workspace \
  && chown -R claudeuser:claudeuser /workspace

RUN git config --global user.email "claudable@in2peta.ai" \
 && git config --global user.name "Claudable Agent" \
 && git config --global init.defaultBranch main

USER claudeuser
WORKDIR /workspace

ENV ANTHROPIC_API_KEY=""
ENV NODE_ENV=production
CMD ["tail", "-f", "/dev/null"]
