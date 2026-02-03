import matter from "gray-matter";

interface ParsedSkill {
  name: string;
  description: string;
  tags?: string[];
  version?: string;
  content: string;
}

export function parseSkillMd(raw: string): ParsedSkill {
  const { data, content } = matter(raw);

  const name: string = data.name || "";
  const description: string = data.description || "";

  let tags: string[] | undefined;
  if (data.metadata?.tags) {
    const rawTags = data.metadata.tags;
    if (typeof rawTags === "string") {
      tags = rawTags.split(",").map((t: string) => t.trim());
    } else if (Array.isArray(rawTags)) {
      tags = rawTags;
    }
  }

  const version: string | undefined = data.version || data.metadata?.version || undefined;

  return { name, description, tags, version, content };
}
