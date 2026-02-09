import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const OUTPUT_DIR = "/tmp/chat-skills-output";

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(OUTPUT_DIR)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }

    const buffer = await fs.readFile(resolved);
    const filename = path.basename(resolved);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
