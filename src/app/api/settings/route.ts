import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4o",
    skillsDir: process.env.SKILLS_DIR || "~/.claude/skills",
  });
}
