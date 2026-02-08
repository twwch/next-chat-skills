# Next-Chat-Skills：一个会自己找工具、装工具、用工具的 AI 助手

## 一个真实的使用场景

上周我想总结一个 YouTube 视频的内容。

我打开 Next-Chat-Skills，输入：

> "帮我总结这个视频：https://youtube.com/watch?v=xxxxx"

AI 回复说："我需要一个视频总结的 Skill，让我帮你找一下。"

然后它**自己去搜索**，找到了一个叫 `video-summarizer` 的 Skill，问我要不要安装。

我说"装吧"。

它就**自己执行安装命令**，把 Skill 下载到了我的 `~/.claude/skills` 目录。

安装完成后，它**自动调用**这个 Skill，下载视频、提取音频、语音转文字、生成摘要——整个过程我只是在聊天框里打了两句话。

**这就是 Next-Chat-Skills 的核心理念：AI 不只是告诉你怎么做，而是直接帮你做。**

---

## 它能做什么？

### 1. 自己找工具

当你提出一个需求，而 AI 发现自己没有对应的能力时，它会主动去搜索可用的 Skills。

```
你：帮我把这个 Figma 设计稿转成 React 代码

AI：我目前没有处理 Figma 的 Skill，让我搜索一下...
    找到了 figma-to-react，要安装吗？
```

不需要你去翻文档、找工具、研究怎么用。AI 会帮你搞定。

### 2. 自己装工具

确认安装后，AI 会执行安装命令：

```
AI：正在安装 figma-to-react...
    ✓ 克隆仓库到 ~/.claude/skills/figma-to-react
    ✓ 安装 Python 依赖
    ✓ 安装完成！
```

整个过程透明可见，你能看到它在做什么。

### 3. 自己用工具

安装完成后，AI 会自动调用 Skill 来完成你的任务：

```
AI：正在调用 figma-to-react...
    - 获取 Figma 设计数据
    - 分析组件结构
    - 生成 React 代码

    已生成以下文件：
    📄 LoginPage.tsx
    📄 Button.tsx
    📄 Input.tsx
```

生成的文件直接显示在对话中，你可以预览、复制、下载。

### 4. 自己修问题

这是最惊艳的部分。当 Skill 执行出错时，AI 不会傻傻地报错完事，它会**尝试自己修复**。

```
AI：执行出错：ModuleNotFoundError: No module named 'whisper'

    看起来缺少依赖，我来安装一下...

    pip install openai-whisper

    ✓ 依赖安装完成，重新执行...
```

Python 包没装？它帮你装。
Node 版本不对？它会告诉你怎么解决。
脚本有 bug？它会尝试修复或给出建议。

### 5. 自己造工具

当现有的 Skills 无法满足需求时，你可以让 AI 帮你创建一个新的 Skill：

```
你：帮我创建一个 Skill，可以批量压缩图片

AI：好的，我来创建一个图片压缩 Skill。

    📁 创建目录 ~/.claude/skills/image-compressor
    📄 创建 SKILL.md（Skill 描述文件）
    📄 创建 compress.py（压缩脚本）

    Skill 创建完成！你可以说"压缩这些图片"来使用它。
```

从此以后，你说"压缩图片"，AI 就会自动调用这个 Skill。

---

## 实际演示

### 场景一：总结 B站视频

```
你：总结一下这个视频 BV1xx411c7mD

AI：[调用 video-summarizer]

    📺 视频信息
    标题：xxx
    时长：15:32

    📝 内容摘要
    这个视频主要讲了三个部分：
    1. ...
    2. ...
    3. ...

    💡 核心观点
    - ...
    - ...
```

### 场景二：设计 UI 界面

```
你：帮我设计一个暗色主题的登录页面，要有 Google 登录按钮

AI：[调用 ui-ux-pro-max]

    我为你设计了一个现代感的登录页面：

    📄 LoginPage.tsx
    [代码预览]

    🎨 使用了以下设计元素：
    - 毛玻璃效果背景
    - 渐变色 Google 按钮
    - 微动效输入框
```

### 场景三：处理 Excel 数据

```
你：[上传 sales.xlsx]
    帮我分析这个销售数据，找出销量最高的产品

AI：[调用 data-analyzer]

    📊 数据分析结果

    销量 TOP 5：
    1. 产品A - 15,230 件
    2. 产品B - 12,450 件
    ...

    📈 趋势洞察
    - 产品A 在 Q3 增长 45%
    - 周末销量平均高出 23%
```

---

## 为什么要做这个项目？

市面上有很多 AI 聊天应用，但它们都有一个共同的问题：**AI 只能说，不能做**。

- ChatGPT 可以告诉你命令，但不能帮你执行
- Claude 可以写出代码，但不能帮你运行
- Copilot 可以补全代码，但不能帮你部署

我想要的是一个**真正的 AI 助手**——它不只是一个问答机器，而是能够：

1. **理解我的意图**
2. **找到合适的工具**
3. **执行具体的任务**
4. **处理过程中的问题**

Next-Chat-Skills 就是这样一个项目。

---

## 技术亮点

### Skills 即插即用

每个 Skill 就是一个文件夹，包含：
- `SKILL.md`：描述文件（告诉 AI 这个 Skill 能做什么）
- 执行脚本（Python/Shell/Node 都行）

```
~/.claude/skills/
├── video-summarizer/
├── ui-ux-pro-max/
├── image-compressor/
└── deploy-helper/
```

AI 会自动读取所有 Skills，根据对话内容决定调用哪个。

### 执行环境隔离

Docker 镜像内置了 Node.js 和 Python 环境，Skills 脚本在容器内执行，不会影响你的主机系统。

### 多数据库支持

- **SQLite**：零配置，开箱即用
- **PostgreSQL**：适合生产环境

### 可选的用户认证

- 开启认证：Google OAuth 登录，数据按用户隔离
- 关闭认证：匿名模式，用浏览器指纹标识用户

---

## 快速体验

### Docker 一键启动

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=你的API密钥 \
  -e OPENAI_MODEL=gpt-4o \
  -v ~/.claude/skills:/home/nextjs/.claude/skills:ro \
  twwch/next-chat-skills:latest
```

打开 http://localhost:3000 ，开始和 AI 对话。

### 试试这些指令

- "有什么可用的 Skills？"
- "帮我找一个可以总结视频的 Skill"
- "帮我创建一个 Skill，用来..."
- 上传一个文件，问"帮我分析这个文件"

---

## 开源地址

**GitHub**：https://github.com/twwch/chat-skills

**Docker Hub**：`twwch/next-chat-skills`

Apache 2.0 协议，欢迎 Star、Fork、PR！

---

## 写在最后

Next-Chat-Skills 的目标不是替代 ChatGPT 或 Claude，而是给它们装上"手脚"。

AI 的能力边界，不再是模型本身的限制，而是你愿意给它装多少 Skills。

**让 AI 真正成为你的助手，而不只是一个聊天机器人。**
