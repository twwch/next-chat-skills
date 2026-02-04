import { NextRequest } from "next/server";

const OFFICE_EXTS = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".odt", ".odp", ".ods"]);
const TEXT_EXTS = new Set([".txt", ".md", ".markdown", ".csv", ".log"]);
const IMAGE_EXTS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = getExt(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    // Images → base64 data URL
    const mimeType = IMAGE_EXTS[ext];
    if (mimeType) {
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;
      return Response.json({ type: "image", name: file.name, dataUrl });
    }

    // Plain text files → read as UTF-8
    if (TEXT_EXTS.has(ext)) {
      const text = buffer.toString("utf-8");
      return Response.json({ type: "document", name: file.name, text });
    }

    // Office / PDF → officeparser
    if (OFFICE_EXTS.has(ext)) {
      const { OfficeParser } = await import("officeparser");
      const ast = await OfficeParser.parseOffice(buffer);
      const text = ast.toText();
      return Response.json({ type: "document", name: file.name, text });
    }

    return Response.json(
      { error: `Unsupported file type: ${ext || "(no extension)"}` },
      { status: 400 }
    );
  } catch (e) {
    console.error("files-parse error:", e);
    return Response.json(
      { error: "Failed to parse file" },
      { status: 500 }
    );
  }
}
