import { streamText, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { listSkills } from "@/lib/skills-reader";
import fs from "fs";
import path from "path";

// AI SDK v6 UIMessage uses `parts` array instead of `content` string.
// Extract plain text from either format.
interface IncomingMessage {
  role: string;
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}

function extractText(msg: IncomingMessage): string {
  // v6 format: parts array
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("");
  }
  // legacy format: content string
  if (typeof msg.content === "string") return msg.content;
  return "";
}

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, settings, images } = body as {
    messages: IncomingMessage[];
    settings?: {
      openaiApiKey?: string;
      openaiBaseUrl?: string;
      model?: string;
    };
    images?: Array<{ name: string; dataUrl: string }>;
  };

  const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || "";
  const baseURL =
    settings?.openaiBaseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = settings?.model || process.env.OPENAI_MODEL || "gpt-4o";

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "No API key configured. Please set your API key in Settings.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const openai = createOpenAI({
    apiKey,
    baseURL,
  });

  const allSkills = await listSkills();
  const allSkillNames = allSkills.map((s) => s.name);

  // Convert incoming UIMessages to the format streamText expects (needed early for @mention extraction)
  const allConvertedMessages = messages
    .map((m) => {
      const text = extractText(m);
      if (!text) return null;
      return {
        role: m.role as "user" | "assistant" | "system",
        content: text,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // Limit to the latest 10 rounds (20 messages: user + assistant pairs)
  const MAX_HISTORY_ROUNDS = 10;
  const MAX_MESSAGES = MAX_HISTORY_ROUNDS * 2;
  const convertedMessages = allConvertedMessages.length > MAX_MESSAGES
    ? allConvertedMessages.slice(-MAX_MESSAGES)
    : allConvertedMessages;

  // Extract @mentions from the latest user message BEFORE building the prompt.
  // If the user @mentions specific skills, only include those in the prompt
  // so the AI cannot see or invoke any other skill.
  const lastUserMsg = [...convertedMessages].reverse().find((m) => m.role === "user");
  const mentions = lastUserMsg
    ? Array.from(lastUserMsg.content.matchAll(/@([\w-]+)/g)).map((m) => m[1])
    : [];
  const matchedMentions = mentions.filter((m) => allSkillNames.includes(m));
  const unmatchedMentions = mentions.filter((m) => !allSkillNames.includes(m));

  // Filter skills: if user used @mentions, only show matched skills in the prompt.
  // If none matched, show NO skills so the AI can't pick a wrong one.
  const hasMentions = mentions.length > 0;
  const skills = hasMentions
    ? allSkills.filter((s) => matchedMentions.includes(s.name))
    : allSkills;

  // Inject system messages for unmatched @mentions
  if (unmatchedMentions.length > 0) {
    convertedMessages.push({
      role: "system" as const,
      content: `[SYSTEM] The user mentioned ${unmatchedMentions.map((n) => "@" + n).join(", ")} but NO skill with ${unmatchedMentions.length === 1 ? "that name exists" : "those names exist"}. Do NOT use any skill as a substitute. Handle the request with your own capabilities. Do NOT output any \`\`\`skill code blocks.`,
    });
  }

  // Build skill overview list with full script paths (scripts/xxx.py)
  const skillsContext = skills
    .map((s) => {
      const scriptList = s.hasScripts && s.scripts?.length
        ? ` (scripts: ${s.scripts.map((f) => "scripts/" + f).join(", ")})`
        : "";
      return `- **${s.name}**: ${s.description}${scriptList}`;
    })
    .join("\n");

  // Read SKILL.md content for skills; include path and list reference filenames (loaded on demand)
  const skillDetails = skills
    .map((s) => {
      const parts: string[] = [];
      // Read SKILL.md — include the skill's absolute path for correct script resolution
      try {
        const content = fs.readFileSync(path.join(s.path, "SKILL.md"), "utf-8");
        parts.push(`### ${s.name}\n\n**Path:** \`${s.path}\`\n\n${content}`);
      } catch {
        parts.push(`### ${s.name}\n\n**Path:** \`${s.path}\`\n\nNo detailed instructions available.`);
      }
      // List available references (filenames only, not content)
      const refsDir = path.join(s.path, "references");
      if (fs.existsSync(refsDir)) {
        try {
          const refFiles = fs.readdirSync(refsDir).filter((f) => f.endsWith(".md"));
          if (refFiles.length > 0) {
            parts.push(`**Available references:** ${refFiles.join(", ")}`);
          }
        } catch {
          // ignore
        }
      }
      return parts.join("\n\n");
    })
    .join("\n\n---\n\n");

  // Build an explicit allow-list of skill names for strict matching
  const skillNameList = skills.map((s) => s.name);
  const skillNameListStr = skillNameList.length > 0
    ? skillNameList.map((n) => `\`${n}\``).join(", ")
    : "(none)";

  const systemPrompt = `You are Next-Chat-Skills, an AI assistant that can leverage installed skills to help users.

## ⚠️ SKILL MATCHING RULES (READ FIRST — HIGHEST PRIORITY)

The ONLY installed skill names are: ${skillNameListStr}

When the user writes \`@something\` in their message:
1. Check if "something" **exactly matches** one of the installed skill names listed above
2. If YES → use that skill, follow its SKILL.md
3. If NO → do NOT use ANY skill. Handle the request yourself. You may tell the user the skill is not installed.

**ABSOLUTE RULES:**
- NEVER use a skill whose name does not exactly match the @mention
- NEVER substitute a similar or related skill (e.g. user says \`@pptx\` → there is no "pptx" skill → do NOT use "ui-ux-pro-max" or any other skill)
- Without an @mention, only use a skill when the request exactly matches a skill's purpose (e.g. user asks "summarize this meeting" → use \`meeting-summary\`)
- When in doubt, do NOT use any skill

---

## Installed Skills

${skillsContext || "No skills installed."}

## Installed Skills Details

${skillDetails || "No skills installed."}

---

## How to Use Skills

Every skill has a SKILL.md that defines its instructions, output format, and workflow. You MUST follow the SKILL.md instructions when using a skill.

### 1. Follow SKILL.md instructions FIRST
When a user request matches a skill (via @mention or by context), follow the instructions in its SKILL.md directly. Most skills work by providing guidelines, output formats, and workflows that you follow — NO script execution needed.

### 2. Execute scripts ONLY when SKILL.md says to
Scripts are optional tools within a skill. Only invoke a script when the SKILL.md explicitly instructs you to do so (e.g. "run upload.py after generating the summary", "use search.py to find design recommendations").

To execute a script:
\`\`\`skill
{
  "skill": "skill-name",
  "action": "execute",
  "script": "scripts/script-name.py",
  "args": ["arg1", "--flag", "value"],
  "stdin": "optional data to pipe to script stdin",
  "timeout": 30
}
\`\`\`

- **stdin**: If the script reads from stdin, provide the data here (e.g. JSON content for upload scripts)
- **timeout**: Max seconds the script can run (default: 60). Use the timeout value from SKILL.md if specified.

IMPORTANT: Only use script paths listed in the skill's scripts list. NEVER guess script names.

### 3. Load references on demand
Skills may have reference files (listed as "Available references" above). Load a reference ONLY when the SKILL.md says it's needed for the current context (e.g. "load finance-handbook.md when meeting involves budgets"):
\`\`\`skill
{
  "skill": "skill-name",
  "action": "load-reference",
  "reference": "filename.md"
}
\`\`\`

### 4. Use subagents for visual inspection
Some skills (e.g. pptx) require visual QA using subagents. A subagent is a separate AI call that analyzes images with fresh eyes. Use this when a SKILL.md instructs you to "use subagents":
\`\`\`skill
{
  "skill": "skill-name",
  "action": "subagent",
  "prompt": "Your inspection prompt here — describe what to look for and list image paths",
  "images": ["/tmp/chat-skills-output/project/slide-01.jpg", "/tmp/chat-skills-output/project/slide-02.jpg"]
}
\`\`\`

- **prompt**: The full inspection prompt (include what to check and expected content per image)
- **images**: Array of absolute paths to image files on disk (JPG, PNG, etc.)
- The subagent will analyze the images and return findings
- Use the subagent results to fix any issues found, then re-verify

### 5. Run shell commands when instructed
Some skills may instruct you to run shell commands (e.g. \`npx skills find\`):
\`\`\`skill
{
  "skill": "skill-name",
  "action": "command",
  "command": "the shell command to run"
}
\`\`\`

### 6. System skill (built-in)
The \`system\` skill is ALWAYS available for running system-level commands like installing skills:
\`\`\`skill
{
  "skill": "system",
  "action": "command",
  "command": "npx skills add -g --yes openstatusHQ/openstatus"
}
\`\`\`

IMPORTANT: When installing skills, ALWAYS use \`"skill": "system"\`.

## Workflow: Wait for script/reference results

When you invoke a script, command, or load-reference action:
1. Invoke it FIRST
2. Tell the user you are waiting for results
3. Do NOT generate final output yet — STOP after invoking
4. The system will send you the results automatically
5. ONLY THEN continue with your response using those results

## File Creation

**CRITICAL: ALL generated files MUST be saved under \`/tmp/chat-skills-output/\`. NEVER save files to the user's home directory, desktop, or any other location. This is a strict security rule — no exceptions.**

When the task requires creating files (e.g. HTML prototypes, code, PPTX, PDF), use SIX backticks (\`\`\`\`\`\`) as the delimiter so inner code blocks (triple or quadruple backticks) don't break parsing:

\`\`\`\`\`\`file:/tmp/chat-skills-output/<project-name>/filename.ext
<file content here — can safely contain \`\`\` and \`\`\`\` code blocks>
\`\`\`\`\`\`

When scripts generate files, you MUST pass output paths under \`/tmp/chat-skills-output/<project-name>/\` as arguments. For example:
- \`"args": ["/tmp/chat-skills-output/my-ppt/output.pptx"]\`
- NEVER use paths like \`~/filename\`, \`./filename\`, or \`/Users/xxx/filename\`

### Project directory rules:
1. ALWAYS create a project subdirectory under /tmp/chat-skills-output/ — NEVER put files directly in the root
2. Choose a short, descriptive directory name based on the user's request (e.g. "todolist", "landing-page", "dashboard")
3. For multi-file projects, put all files in the same project directory
4. When modifying existing files, use the SAME directory path from the previous file creation — do NOT create a new directory

### Examples:
- New todolist app: \`/tmp/chat-skills-output/todolist/index.html\`
- New landing page: \`/tmp/chat-skills-output/spa-landing/index.html\`, \`/tmp/chat-skills-output/spa-landing/styles.css\`
- Modifying the todolist: reuse \`/tmp/chat-skills-output/todolist/index.html\` (same path)

IMPORTANT:
- MUST use SIX backticks (\`\`\`\`\`\`) to wrap file blocks — this prevents inner code examples from breaking the file boundary
- The path MUST start with /tmp/chat-skills-output/
- After creating files, tell the user the full file path so they can open it

## Dependency Management

When a script or command fails due to a missing dependency (e.g. "command not found", "No module named ...", "Cannot find module ..."), you MUST install the missing dependency and retry — do NOT switch to an alternative package or workaround. Use the system skill to install:
- System commands: \`brew install <pkg>\` (macOS) or \`apt-get install -y <pkg>\` (Linux)
- Python packages: \`pip install <pkg>\`
- Node.js packages: \`npm install -g <pkg>\`

Example: if \`pdftoppm\` is not found, install it via \`brew install poppler\` (macOS) or \`apt-get install -y poppler-utils\` (Linux), then retry the original command.

## Script Results

When a user message starts with "[Skill execution result", it contains output from a skill script you previously invoked. Use this output to continue the task (e.g. apply design recommendations to generate code). Do NOT re-invoke the same skill. Continue working with the results.

## IMPORTANT: No Tool Calling

You do NOT have access to any tools, function calling, or APIs. NEVER output \`<function_calls>\`, \`<invoke>\`, \`<tool_call>\`, or any XML/JSON-style tool invocations. You cannot read images, open files, browse the web, or execute code directly.

The ONLY way you can trigger external actions is through \`\`\`skill code blocks as documented above. Everything else must be plain text/markdown output.

Be helpful, concise, and use skills when they are relevant to the user's request. Respond in the same language as the user.`;

  // Inject images into the last user message for multimodal support
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalMessages: any[] = convertedMessages;
  if (images && images.length > 0) {
    const lastIdx = finalMessages.findLastIndex((m: { role: string }) => m.role === "user");
    if (lastIdx >= 0) {
      const msg = finalMessages[lastIdx];
      finalMessages[lastIdx] = {
        role: "user",
        content: [
          { type: "text", text: msg.content },
          ...images.map((img: { name: string; dataUrl: string }) => {
            const match = img.dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)/);
            return {
              type: "image",
              image: match ? match[2] : img.dataUrl,
              mimeType: match ? match[1] : "image/png",
            };
          }),
        ],
      };
    }
  }

  const result = streamText({
    model: openai.chat(model),
    system: systemPrompt,
    messages: finalMessages,
    maxOutputTokens: 16384,
  });

  // Create a custom stream that includes usage data
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Merge the streamText result into our stream
      writer.merge(result.toUIMessageStream());

      // Wait for the stream to finish and write usage data
      const usage = await result.usage;
      writer.write({
        type: "data-usage",
        data: {
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
        },
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
