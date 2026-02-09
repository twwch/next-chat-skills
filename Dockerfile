# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app

# Install build tools for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Stage 3: Production runner
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV PIP_BREAK_SYSTEM_PACKAGES=1
ENV PIP_USER=1
ENV NPM_CONFIG_PREFIX=/home/nextjs/.npm-global
ENV PATH="/home/nextjs/.npm-global/bin:/home/nextjs/.local/bin:${PATH}"

# Install Python 3 + pip + git + sudo for Skills script execution and skill installation
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv git sudo && \
    rm -rf /var/lib/apt/lists/* && \
    ln -sf /usr/bin/python3 /usr/bin/python

# Create non-root user with passwordless sudo
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    echo "nextjs ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/nextjs

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Create skills directory and npm-global directory
RUN mkdir -p /home/nextjs/.claude/skills /home/nextjs/.npm-global && \
    chown -R nextjs:nodejs /home/nextjs/.claude /home/nextjs/.npm-global
ENV HOME=/home/nextjs
RUN npx skills add https://github.com/vercel-labs/skills --skill find-skills --yes --global
RUN npx skills add nextlevelbuilder/ui-ux-pro-max-skill --yes --global
RUN npx skills add anthropics/skills --skill skill-creator --yes --global

# Fix npm cache permissions (npx runs as root but HOME=/home/nextjs)
RUN chown -R nextjs:nodejs /home/nextjs

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
