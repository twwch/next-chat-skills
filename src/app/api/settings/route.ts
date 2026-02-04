import { NextResponse } from "next/server";
import { getStorage } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/types";

export async function GET() {
  try {
    const storage = await getStorage();
    const dbSettings = await storage.getSettings();

    return NextResponse.json({
      openaiApiKey: dbSettings?.openaiApiKey || process.env.OPENAI_API_KEY || DEFAULT_SETTINGS.openaiApiKey,
      openaiBaseUrl: dbSettings?.openaiBaseUrl || process.env.OPENAI_BASE_URL || DEFAULT_SETTINGS.openaiBaseUrl,
      model: dbSettings?.model || process.env.OPENAI_MODEL || DEFAULT_SETTINGS.model,
      skillsDir: dbSettings?.skillsDir || process.env.SKILLS_DIR || DEFAULT_SETTINGS.skillsDir,
    });
  } catch {
    // Fallback to env-only if DB is unavailable
    return NextResponse.json({
      openaiApiKey: process.env.OPENAI_API_KEY || "",
      openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL || "gpt-4o",
      skillsDir: process.env.SKILLS_DIR || "~/.claude/skills",
    });
  }
}
