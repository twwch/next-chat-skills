import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/types";

export async function GET(req: NextRequest) {
  // Allow overriding via query params (for when settings haven't been saved yet)
  const url = new URL(req.url);
  const qKey = url.searchParams.get("apiKey");
  const qBase = url.searchParams.get("baseUrl");

  let apiKey = qKey || "";
  let baseURL = qBase || "";

  if (!apiKey || !baseURL) {
    try {
      const storage = await getStorage();
      const dbSettings = await storage.getSettings();
      if (!apiKey) apiKey = dbSettings?.openaiApiKey || process.env.OPENAI_API_KEY || "";
      if (!baseURL)
        baseURL =
          dbSettings?.openaiBaseUrl ||
          process.env.OPENAI_BASE_URL ||
          DEFAULT_SETTINGS.openaiBaseUrl;
    } catch {
      if (!apiKey) apiKey = process.env.OPENAI_API_KEY || "";
      if (!baseURL) baseURL = process.env.OPENAI_BASE_URL || DEFAULT_SETTINGS.openaiBaseUrl;
    }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured", models: [] },
      { status: 400 }
    );
  }

  // Normalize: remove trailing slash
  const base = baseURL.replace(/\/+$/, "");
  const modelsUrl = `${base}/models`;

  try {
    const res = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Models API returned ${res.status}`, models: [] },
        { status: 502 }
      );
    }

    const data = await res.json();
    // OpenAI-compatible format: { data: [{ id: "model-name", ... }] }
    const models: string[] = (data.data || [])
      .map((m: { id: string }) => m.id)
      .filter(Boolean)
      .sort();

    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return NextResponse.json(
      { error: message, models: [] },
      { status: 502 }
    );
  }
}
