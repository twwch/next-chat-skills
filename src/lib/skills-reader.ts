import fs from "fs";
import path from "path";
import os from "os";
import { parseSkillMd } from "./skill-parser";
import type { Skill } from "@/types";

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function listSkills(skillsDir?: string): Promise<Skill[]> {
  const dir = expandHome(
    skillsDir || process.env.SKILLS_DIR || "~/.claude/skills"
  );

  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

    const skillPath = path.join(dir, entry.name);
    let resolvedPath = skillPath;

    try {
      const stat = fs.statSync(skillPath);
      if (!stat.isDirectory()) {
        resolvedPath = fs.realpathSync(skillPath);
        const rstat = fs.statSync(resolvedPath);
        if (!rstat.isDirectory()) continue;
      }
    } catch {
      continue;
    }

    const skillMdPath = path.join(resolvedPath, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    const raw = fs.readFileSync(skillMdPath, "utf-8");
    const parsed = parseSkillMd(raw);

    const hasScripts = fs.existsSync(path.join(resolvedPath, "scripts"));
    const hasRules = fs.existsSync(path.join(resolvedPath, "rules"));
    const hasData = fs.existsSync(path.join(resolvedPath, "data"));

    let scripts: string[] = [];
    if (hasScripts) {
      try {
        scripts = fs
          .readdirSync(path.join(resolvedPath, "scripts"))
          .filter((f) => !f.startsWith("__") && !f.startsWith("."));
      } catch {
        // ignore
      }
    }

    let rules: string[] = [];
    if (hasRules) {
      try {
        rules = fs
          .readdirSync(path.join(resolvedPath, "rules"))
          .filter((f) => f.endsWith(".md"));
      } catch {
        // ignore
      }
    }

    skills.push({
      name: parsed.name || entry.name,
      description: parsed.description || "",
      tags: parsed.tags,
      version: parsed.version,
      hasScripts,
      hasRules,
      hasData,
      scripts,
      rules,
      path: resolvedPath,
    });
  }

  return skills;
}

export async function getSkillDetail(
  name: string,
  skillsDir?: string
): Promise<Skill | null> {
  const skills = await listSkills(skillsDir);
  const skill = skills.find((s) => s.name === name);
  if (!skill) return null;

  const skillMdPath = path.join(skill.path, "SKILL.md");
  if (fs.existsSync(skillMdPath)) {
    skill.content = fs.readFileSync(skillMdPath, "utf-8");
  }

  return skill;
}
