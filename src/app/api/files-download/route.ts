import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const OUTPUT_DIR = "/tmp/chat-skills-output";

async function findFile(filePath: string): Promise<string | null> {
  // Try exact path first
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) return filePath;
  } catch { /* not found, try fallback */ }

  // Fallback: list directory and find matching basename
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  try {
    const files = await fs.readdir(dir);
    // Exact match
    const exact = files.find((f) => f === base);
    if (exact) return path.join(dir, exact);
    // Extension match (in case of encoding differences, pick the only file with same extension)
    const ext = path.extname(base).toLowerCase();
    const byExt = files.filter((f) => path.extname(f).toLowerCase() === ext);
    if (byExt.length === 1) return path.join(dir, byExt[0]);
  } catch { /* dir not found */ }

  return null;
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(OUTPUT_DIR)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const actualPath = await findFile(resolved);
  if (!actualPath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(actualPath);
    const filename = path.basename(actualPath);
    const encodedFilename = encodeURIComponent(filename).replace(/'/g, "%27");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
