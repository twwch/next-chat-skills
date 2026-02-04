import { NextRequest } from "next/server";
import { listSkills } from "@/lib/skills-reader";
import { executeSkillScript, executeShellCommand } from "@/lib/skill-executor";
import os from "os";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { skillName, scriptPath, command, args = [], stdin, timeout } = body as {
    skillName: string;
    scriptPath?: string;
    command?: string;
    args?: string[];
    stdin?: string;
    timeout?: number;
  };

  if (!skillName || (!scriptPath && !command)) {
    return new Response(
      JSON.stringify({ error: "skillName and (scriptPath or command) are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // "system" is a built-in virtual skill for shell commands (e.g. installing skills)
  const isSystem = skillName === "system";

  let skill: Awaited<ReturnType<typeof listSkills>>[number] | undefined;
  if (!isSystem) {
    const skills = await listSkills();
    skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (isSystem && !command) {
    return new Response(
      JSON.stringify({ error: "system skill requires a command" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      const onEvent = (event: { type: string; line?: { type: string; text: string }; code?: number }) => {
        try {
          send(JSON.stringify(event));
        } catch {
          // stream may be closed
        }
      };

      const onDone = () => {
        try {
          send("[DONE]");
          controller.close();
        } catch {
          // ignore
        }
      };

      if (command) {
        executeShellCommand(command, os.homedir(), onEvent, onDone);
      } else {
        executeSkillScript(skill!.path, scriptPath!, args, onEvent, onDone, { stdin, timeout });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
