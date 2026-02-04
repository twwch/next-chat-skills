import { streamText } from "ai";
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
  const { messages, settings } = body as {
    messages: IncomingMessage[];
    settings?: {
      openaiApiKey?: string;
      openaiBaseUrl?: string;
      model?: string;
    };
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

  const skills = await listSkills();

  // Classify skills into three types:
  // [script] - has executable scripts (e.g. ui-ux-pro-max)
  // [rules]  - no scripts, provides guidelines/instructions the AI follows directly
  function skillType(s: typeof skills[number]): "script" | "rules" {
    return s.hasScripts ? "script" : "rules";
  }

  const skillsContext = skills
    .map(
      (s) =>
        `- **${s.name}** [${skillType(s)}]: ${s.description}${s.hasScripts ? ` (scripts: ${s.scripts?.join(", ")})` : ""}`
    )
    .join("\n");

  // For non-script skills, read their SKILL.md content so the AI knows how to use them
  const rulesSkillDetails = skills
    .filter((s) => !s.hasScripts)
    .map((s) => {
      try {
        const content = fs.readFileSync(path.join(s.path, "SKILL.md"), "utf-8");
        return `### ${s.name}\n\n${content}`;
      } catch {
        return `### ${s.name}\n\nNo detailed instructions available.`;
      }
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are Chat-Skills, an AI assistant that can leverage installed skills to help users. You have access to the following skills:

${skillsContext || "No skills installed."}

## Skill Types

### 1. Script-based skills (marked [script])
These skills have executable scripts. Invoke them using a skill block:
\`\`\`skill
{
  "skill": "skill-name",
  "action": "execute",
  "script": "scripts/script-name.py",
  "args": ["arg1", "--flag", "value"]
}
\`\`\`

IMPORTANT: Only use script paths that are listed in the skill's scripts list above. NEVER guess script names like "core.py" or "main.py".

#### ui-ux-pro-max
The ONLY executable script is \`scripts/search.py\` (NOT core.py or design_system.py).
- The first arg must be a single quoted search query string
- Use \`--design-system\` flag for full design recommendations
- Example: \`"args": ["SaaS dashboard fintech", "--design-system", "-p", "MyProject"]\`
- For domain-specific search: \`"args": ["animation accessibility", "--domain", "ux"]\`
- For stack guidelines: \`"args": ["layout responsive", "--stack", "nextjs"]\`

### 2. Rules-based skills (marked [rules])
These skills have NO executable scripts. They provide instructions and guidelines that you should follow DIRECTLY. Do NOT generate \`\`\`skill blocks for these skills — just follow their instructions.

Some rules skills may instruct you to run shell commands (e.g. \`npx skills find\`). In that case, use a command skill block:
\`\`\`skill
{
  "skill": "skill-name",
  "action": "command",
  "command": "the shell command to run"
}
\`\`\`

Only use command blocks when the skill's instructions explicitly mention a CLI command to run. If the skill only provides writing guidelines, workflows, or best practices, follow them directly WITHOUT any skill block.

## Rules Skills Reference

${rulesSkillDetails || "No rules-based skills installed."}

### 3. System skill (built-in)
There is a built-in virtual skill called \`system\` that is ALWAYS available, even when no other skills are installed. Use it to run shell commands such as installing new skills:
\`\`\`skill
{
  "skill": "system",
  "action": "command",
  "command": "npx skills add openstatusHQ/openstatus"
}
\`\`\`

IMPORTANT: When the user asks to install a skill (e.g. \`npx skills add ...\`), ALWAYS use \`"skill": "system"\`. NEVER use any other skill name for system commands.

## Workflow: ALWAYS wait for skill results first

CRITICAL: When a task requires executing a script or command skill:
1. Invoke the skill FIRST
2. Tell the user you are waiting for the results
3. Do NOT generate any files or code yet. STOP after invoking the skill.
4. The system will automatically send you the skill results when the script finishes.
5. ONLY THEN should you generate files/code using those results.

This ensures the generated output is based on actual skill data, not guesses. Never create files before receiving skill execution results.

## File Creation

When the task requires creating files (e.g. HTML prototypes, code), use FOUR backticks (\`\`\`\`) as the delimiter so inner code blocks (triple backticks) don't break parsing:

\`\`\`\`file:/tmp/chat-skills-output/<project-name>/filename.ext
<file content here — can safely contain \`\`\` code blocks>
\`\`\`\`

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
- MUST use FOUR backticks (\`\`\`\`) to wrap file blocks, NOT three
- The path MUST start with /tmp/chat-skills-output/
- After creating files, tell the user the full file path so they can open it

## Script Results

When a user message starts with "[Skill execution result", it contains output from a skill script you previously invoked. Use this output to continue the task (e.g. apply design recommendations to generate code). Do NOT re-invoke the same skill. Continue working with the results.

Be helpful, concise, and use skills when they are relevant to the user's request. Respond in the same language as the user.`;

  // Convert incoming UIMessages to the format streamText expects
  const convertedMessages = messages
    .map((m) => {
      const text = extractText(m);
      if (!text) return null;
      return {
        role: m.role as "user" | "assistant" | "system",
        content: text,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const result = streamText({
    model: openai.chat(model),
    system: systemPrompt,
    messages: convertedMessages,
  });

  return result.toUIMessageStreamResponse();
}
