import { NextRequest } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, images, settings } = body as {
    prompt: string;
    images: string[];
    settings?: {
      openaiApiKey?: string;
      openaiBaseUrl?: string;
      model?: string;
    };
  };

  if (!prompt || !images || images.length === 0) {
    return new Response(
      JSON.stringify({ error: "prompt and images are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || "";
  const baseURL =
    settings?.openaiBaseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = settings?.model || process.env.OPENAI_MODEL || "gpt-4o";

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "No API key configured." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Read images and convert to base64 data URLs
  const imageContents: Array<{ type: "image"; image: string; mimeType: string }> = [];
  for (const imgPath of images) {
    try {
      const resolved = imgPath.startsWith("/") ? imgPath : path.resolve(imgPath);
      const data = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
      };
      const mimeType = mimeMap[ext] || "image/jpeg";
      const base64 = data.toString("base64");
      imageContents.push({
        type: "image",
        image: base64,
        mimeType,
      });
    } catch {
      // Skip images that can't be read
    }
  }

  if (imageContents.length === 0) {
    return new Response(
      JSON.stringify({ error: "No readable images found at the provided paths" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const openai = createOpenAI({ apiKey, baseURL });

  try {
    const result = await generateText({
      model: openai.chat(model),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...imageContents,
          ],
        },
      ],
      maxOutputTokens: 4096,
      abortSignal: AbortSignal.timeout(90000),
    });

    return new Response(
      JSON.stringify({ result: result.text }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Subagent call failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
