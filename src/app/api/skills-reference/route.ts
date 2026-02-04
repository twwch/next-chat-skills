import { NextRequest } from "next/server";
import { listSkills } from "@/lib/skills-reader";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { skillName, reference } = body as {
    skillName: string;
    reference: string;
  };

  if (!skillName || !reference) {
    return Response.json(
      { error: "skillName and reference are required" },
      { status: 400 }
    );
  }

  const skills = await listSkills();
  const skill = skills.find((s) => s.name === skillName);
  if (!skill) {
    return Response.json({ error: "Skill not found" }, { status: 404 });
  }

  const refPath = path.join(skill.path, "references", reference);

  // Prevent path traversal
  const resolvedRef = path.resolve(refPath);
  const resolvedRefsDir = path.resolve(path.join(skill.path, "references"));
  if (!resolvedRef.startsWith(resolvedRefsDir)) {
    return Response.json({ error: "Invalid reference path" }, { status: 400 });
  }

  if (!fs.existsSync(resolvedRef)) {
    return Response.json(
      { error: `Reference file not found: ${reference}` },
      { status: 404 }
    );
  }

  try {
    const content = fs.readFileSync(resolvedRef, "utf-8");
    return Response.json({ skillName, reference, content });
  } catch {
    return Response.json(
      { error: "Failed to read reference file" },
      { status: 500 }
    );
  }
}
