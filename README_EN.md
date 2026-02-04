# Next-Chat-Skills

English | [中文](./README.md)

An AI assistant application built with Next.js, featuring conversation management and external Skill (scripts/tools/rules) integration. The AI autonomously decides when to invoke Skills, executing scripts in a sandboxed environment, installing dependencies, and generating files.

## Demo

![Demo](./images/20260204-115652.png)

![Demo](./images/20260204-145302.gif)

![Demo](./images/20260204-160514.gif)



## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **AI**: Vercel AI SDK (@ai-sdk/openai)
- **UI**: Tailwind CSS 4 + shadcn/ui (Radix UI)
- **Database**: Drizzle ORM with SQLite and PostgreSQL backends
- **Skills**: Loaded from local `~/.claude/skills` directory, parsed from SKILL.md (YAML frontmatter)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.local.example` or create `.env.local` manually:

```bash
# AI Model Configuration
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
SKILLS_DIR=~/.claude/skills

# Storage Configuration: 'sqlite' or 'postgresql'
STORAGE_TYPE=sqlite

# SQLite (used when STORAGE_TYPE=sqlite)
SQLITE_PATH=./data/chat-skills.db

# PostgreSQL (used when STORAGE_TYPE=postgresql)
# DATABASE_URL=postgresql://user:password@localhost:5432/chatskills
```

### 3. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the application.

## Data Storage

The application supports two database backends through an abstract `StorageProvider` interface, switchable via the `STORAGE_TYPE` environment variable:

### SQLite (Default)

- Zero configuration, works out of the box
- Data stored at `./data/chat-skills.db` (customizable via `SQLITE_PATH`)
- Database files are excluded in `.gitignore`
- Suitable for local development and single-instance deployment

### PostgreSQL

- Requires `STORAGE_TYPE=postgresql` and `DATABASE_URL`
- Suitable for multi-instance deployment and production environments
- Example connection string: `postgresql://user:password@localhost:5432/chatskills`

### Storage Architecture

```
src/lib/db/
  storage.ts          -- StorageProvider abstract interface
  schema-sqlite.ts    -- SQLite table definitions (Drizzle)
  schema-pg.ts        -- PostgreSQL table definitions (Drizzle)
  sqlite-storage.ts   -- SQLite implementation
  pg-storage.ts       -- PostgreSQL implementation
  index.ts            -- Factory function, selects backend based on STORAGE_TYPE
```

Database tables are automatically created on application startup — no manual migration required.

## Project Structure

```
src/
  app/
    page.tsx                    -- Main page (chat interface)
    api/
      chat/                     -- AI chat API
      db/                       -- Database CRUD API
        conversations/          -- Conversation CRUD
        settings/               -- Settings read/write
      settings/                 -- Environment variable config API
      skills/                   -- Skill list/details
      skills-execute/           -- Skill script execution
      files-write/              -- File write operations
  components/                   -- UI components
  providers/
    AppProvider.tsx              -- Global state management (Context + DB persistence)
  lib/
    db/                         -- Database abstraction layer
    skills-reader.ts            -- Skill directory reader
    skill-parser.ts             -- SKILL.md parser
    skill-executor.ts           -- Script executor
  types/
    index.ts                    -- TypeScript type definitions
  hooks/                        -- React Hooks
```

## Docker Deployment

The image includes Node.js 20 + Python 3 runtime for Skills script execution.

### Using the Pre-built Image

```bash
docker pull twwch/next-chat-skills:latest

docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your-api-key \
  -e OPENAI_BASE_URL=https://api.openai.com/v1 \
  -e OPENAI_MODEL=gpt-4o \
  -e STORAGE_TYPE=sqlite \
  -v chat-skills-data:/app/data \
  -v ~/.claude/skills:/home/nextjs/.claude/skills:ro \
  twwch/next-chat-skills:latest
```

### With PostgreSQL

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your-api-key \
  -e STORAGE_TYPE=postgresql \
  -e DATABASE_URL=postgresql://user:pass@host:5432/chatskills \
  -v ~/.claude/skills:/home/nextjs/.claude/skills:ro \
  twwch/next-chat-skills:latest
```

### Build Locally

```bash
docker build -t next-chat-skills .
docker run -d -p 3000:3000 -e OPENAI_API_KEY=your-key next-chat-skills
```

### CI/CD

GitHub Actions is configured to automatically build and push to DockerHub on pushes to the `main` branch or `v*` tags.

Required GitHub repo Settings -> Secrets:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Available Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run linting
```

## License

This project is licensed under the [Apache License 2.0](./LICENSE).
