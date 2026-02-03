"use client";

import { useEffect, useCallback } from "react";
import { useApp } from "@/providers/AppProvider";
import type { Skill } from "@/types";

export function useSkills() {
  const { skills, setSkills } = useApp();

  const refreshSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) return;
      const data: Skill[] = await res.json();
      setSkills(data);
    } catch (e) {
      console.error("Failed to fetch skills:", e);
    }
  }, [setSkills]);

  useEffect(() => {
    if (skills.length === 0) refreshSkills();
  }, [skills.length, refreshSkills]);

  return { skills, refreshSkills };
}

export async function fetchSkillDetail(name: string): Promise<Skill | null> {
  try {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
