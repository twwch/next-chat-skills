import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const OUTPUT_DIR = "/tmp/chat-skills-output";

export async function POST(req: Request) {
  try {
    const { files } = (await req.json()) as {
      files: { filePath: string; content: string }[];
    };

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results: { filePath: string; status: "ok" | "error"; error?: string }[] = [];

    for (const file of files) {
      // Security: only allow writing under /tmp/chat-skills-output/
      const resolved = path.resolve(file.filePath);
      if (!resolved.startsWith(OUTPUT_DIR)) {
        results.push({
          filePath: file.filePath,
          status: "error",
          error: "Path must be under /tmp/chat-skills-output/",
        });
        continue;
      }

      try {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, file.content, "utf-8");
        results.push({ filePath: resolved, status: "ok" });
      } catch (err) {
        results.push({
          filePath: file.filePath,
          status: "error",
          error: String(err),
        });
      }
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
