"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Conversation, Settings, Skill, ActivityItem } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

interface AppContextType {
  conversations: Conversation[];
  currentConversationId: string | null;
  currentConversation: Conversation | null;
  settings: Settings;
  skills: Skill[];
  activities: ActivityItem[];
  activeSkill: Skill | null;
  setCurrentConversationId: (id: string | null) => void;
  createConversation: (title?: string) => Conversation;
  updateConversation: (conv: Conversation) => void;
  updateConversationById: (id: string, updater: (conv: Conversation) => Conversation) => void;
  deleteConversation: (id: string) => void;
  setSettings: (s: Settings) => void;
  setSkills: (s: Skill[]) => void;
  addActivity: (a: ActivityItem, convId?: string) => void;
  setActiveSkill: (s: Skill | null) => void;
  clearActivities: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

const STORAGE_KEYS = {
  conversations: "chat-skills-conversations",
  settings: "chat-skills-settings",
  currentId: "chat-skills-current-id",
  activeSkillName: "chat-skills-active-skill",
};

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConversations(loadFromStorage(STORAGE_KEYS.conversations, []));
    setCurrentConversationId(loadFromStorage(STORAGE_KEYS.currentId, null));

    // Load settings: merge localStorage with server-side .env.local defaults.
    // Server env values fill in any blanks not explicitly set by the user.
    const stored = loadFromStorage<Settings | null>(STORAGE_KEYS.settings, null);

    fetch("/api/settings")
      .then((res) => res.json())
      .then((envDefaults: Settings) => {
        const merged: Settings = {
          openaiApiKey: stored?.openaiApiKey || envDefaults.openaiApiKey || "",
          openaiBaseUrl: stored?.openaiBaseUrl || envDefaults.openaiBaseUrl || DEFAULT_SETTINGS.openaiBaseUrl,
          model: stored?.model || envDefaults.model || DEFAULT_SETTINGS.model,
          skillsDir: stored?.skillsDir || envDefaults.skillsDir || DEFAULT_SETTINGS.skillsDir,
        };
        setSettingsState(merged);
        setHydrated(true);
      })
      .catch(() => {
        // If the fetch fails, fall back to localStorage or defaults
        setSettingsState(stored ?? DEFAULT_SETTINGS);
        setHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (hydrated) saveToStorage(STORAGE_KEYS.conversations, conversations);
  }, [conversations, hydrated]);

  useEffect(() => {
    if (hydrated) saveToStorage(STORAGE_KEYS.settings, settings);
  }, [settings, hydrated]);

  useEffect(() => {
    if (hydrated) saveToStorage(STORAGE_KEYS.currentId, currentConversationId);
  }, [currentConversationId, hydrated]);

  // Restore activeSkill by name once skills are loaded
  useEffect(() => {
    if (skills.length > 0 && !activeSkill) {
      const savedName = loadFromStorage<string | null>(STORAGE_KEYS.activeSkillName, null);
      if (savedName) {
        const found = skills.find((s) => s.name === savedName);
        if (found) setActiveSkill(found);
      }
    }
  }, [skills, activeSkill]);

  // Persist activeSkill name
  useEffect(() => {
    if (hydrated) saveToStorage(STORAGE_KEYS.activeSkillName, activeSkill?.name || null);
  }, [activeSkill, hydrated]);

  const currentConversation =
    conversations.find((c) => c.id === currentConversationId) ?? null;

  // Activities are stored per-conversation, so switching automatically shows the right data
  const activities = currentConversation?.activities || [];

  const createConversation = useCallback((title?: string) => {
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: title || "New Conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      activities: [],
    };
    setConversations((prev) => [conv, ...prev]);
    setCurrentConversationId(conv.id);
    return conv;
  }, []);

  const updateConversation = useCallback((conv: Conversation) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...conv, updatedAt: Date.now() } : c))
    );
  }, []);

  const updateConversationById = useCallback(
    (id: string, updater: (conv: Conversation) => Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...updater(c), updatedAt: Date.now() } : c))
      );
    },
    []
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) setCurrentConversationId(null);
    },
    [currentConversationId]
  );

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
  }, []);

  // Add activity to a specific conversation (defaults to current)
  const addActivity = useCallback((a: ActivityItem, convId?: string) => {
    const targetId = convId || currentConversationId;
    if (!targetId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? { ...c, activities: [...(c.activities || []), a] }
          : c
      )
    );
  }, [currentConversationId]);

  const clearActivities = useCallback(() => {
    if (!currentConversationId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConversationId
          ? { ...c, activities: [] }
          : c
      )
    );
  }, [currentConversationId]);

  return (
    <AppContext.Provider
      value={{
        conversations,
        currentConversationId,
        currentConversation,
        settings,
        skills,
        activities,
        activeSkill,
        setCurrentConversationId,
        createConversation,
        updateConversation,
        updateConversationById,
        deleteConversation,
        setSettings,
        setSkills,
        addActivity,
        setActiveSkill,
        clearActivities,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
