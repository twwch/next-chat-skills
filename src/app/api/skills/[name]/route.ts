import { NextResponse } from "next/server";
import { getSkillDetail } from "@/lib/skills-reader";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const skill = await getSkillDetail(name);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json(skill);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
