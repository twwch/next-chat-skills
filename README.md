# Next-Chat-Skills

[English](./README_EN.md) | 中文

基于 Next.js 的 AI 助手应用，支持对话管理和外部 Skill（脚本/工具/规则）集成。AI 自主决策调用 Skills，黑盒执行脚本、安装依赖、生成文件。

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **AI**: Vercel AI SDK (@ai-sdk/openai)
- **UI**: Tailwind CSS 4 + shadcn/ui (Radix UI)
- **数据库**: Drizzle ORM，支持 SQLite 和 PostgreSQL 两种存储后端
- **Skills**: 从本地 `~/.claude/skills` 目录读取，解析 SKILL.md (YAML frontmatter)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.local.example` 或手动创建 `.env.local`：

```bash
# AI 模型配置
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
SKILLS_DIR=~/.claude/skills

# 存储配置：'sqlite' 或 'postgresql'
STORAGE_TYPE=sqlite

# SQLite（STORAGE_TYPE=sqlite 时生效）
SQLITE_PATH=./data/chat-skills.db

# PostgreSQL（STORAGE_TYPE=postgresql 时生效）
# DATABASE_URL=postgresql://user:password@localhost:5432/chatskills
```

### 3. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

## 数据存储

应用通过抽象的 `StorageProvider` 接口支持两种数据库后端，通过 `STORAGE_TYPE` 环境变量切换：

### SQLite（默认）

- 零配置，开箱即用
- 数据存储在 `./data/chat-skills.db`（可通过 `SQLITE_PATH` 自定义路径）
- 数据库文件已在 `.gitignore` 中排除，不会上传到 GitHub
- 适合本地开发和单机部署

### PostgreSQL

- 需要设置 `STORAGE_TYPE=postgresql` 和 `DATABASE_URL`
- 适合多实例部署和生产环境
- 示例连接字符串：`postgresql://user:password@localhost:5432/chatskills`

### 存储架构

```
src/lib/db/
  storage.ts          -- StorageProvider 抽象接口
  schema-sqlite.ts    -- SQLite 表结构定义 (Drizzle)
  schema-pg.ts        -- PostgreSQL 表结构定义 (Drizzle)
  sqlite-storage.ts   -- SQLite 实现
  pg-storage.ts       -- PostgreSQL 实现
  index.ts            -- 工厂函数，根据 STORAGE_TYPE 选择后端
```

应用启动时自动创建所需的数据库表，无需手动执行迁移。

## 项目结构

```
src/
  app/
    page.tsx                    -- 主页面（对话界面）
    api/
      chat/                     -- AI 对话 API
      db/                       -- 数据库 CRUD API
        conversations/          -- 对话增删改查
        settings/               -- 设置读写
      settings/                 -- 环境变量配置 API
      skills/                   -- Skill 列表/详情
      skills-execute/           -- Skill 脚本执行
      files-write/              -- 文件写入
  components/                   -- UI 组件
  providers/
    AppProvider.tsx              -- 全局状态管理（Context + DB 持久化）
  lib/
    db/                         -- 数据库抽象层
    skills-reader.ts            -- Skill 目录读取
    skill-parser.ts             -- SKILL.md 解析
    skill-executor.ts           -- 脚本执行器
  types/
    index.ts                    -- TypeScript 类型定义
  hooks/                        -- React Hooks
```

## Docker 部署

镜像内置 Node.js 20 + Python 3 运行环境，支持 Skills 脚本执行。

### 使用预构建镜像

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

### 使用 PostgreSQL

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your-api-key \
  -e STORAGE_TYPE=postgresql \
  -e DATABASE_URL=postgresql://user:pass@host:5432/chatskills \
  -v ~/.claude/skills:/home/nextjs/.claude/skills:ro \
  twwch/next-chat-skills:latest
```

### 本地构建

```bash
docker build -t next-chat-skills .
docker run -d -p 3000:3000 -e OPENAI_API_KEY=your-key next-chat-skills
```

### CI/CD

项目配置了 GitHub Actions，推送到 `main` 分支或打 `v*` tag 时自动构建并推送到 DockerHub。

需要在 GitHub repo Settings → Secrets 中配置：
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## 可用脚本

```bash
npm run dev       # 启动开发服务器
npm run build     # 构建生产版本
npm run start     # 启动生产服务器
npm run lint      # 代码检查
```

## 开源协议

本项目基于 [Apache License 2.0](./LICENSE) 开源。
