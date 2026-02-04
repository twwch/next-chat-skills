"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Debounce mechanism for rapid conversation updates (e.g., during skill streaming)
  const pendingUpdates = useRef<Map<string, Conversation>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleFlush() {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(async () => {
      flushTimer.current = null;
      const updates = new Map(pendingUpdates.current);
      pendingUpdates.current.clear();
      for (const [id, conv] of updates) {
        fetch(`/api/db/conversations/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(conv),
        }).catch(console.error);
      }
    }, 300);
  }

  // Hydrate state from database on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const [convRes, settingsRes] = await Promise.all([
          fetch('/api/db/conversations'),
          fetch('/api/db/settings'),
        ]);
        if (convRes.ok) {
          const convs: Conversation[] = await convRes.json();
          setConversations(convs);

          // Restore conversation from URL ?id= param
          const urlId = new URLSearchParams(window.location.search).get("id");
          if (urlId && convs.some((c) => c.id === urlId)) {
            setCurrentConversationId(urlId);
          }
        }
        if (settingsRes.ok) {
          const s: Settings = await settingsRes.json();
          setSettingsState(s);
        }
      } catch {
        // Falls back to defaults on error
      } finally {
        setHydrated(true);
      }
    }
    hydrate();
  }, []);

  // Sync currentConversationId to URL (only after hydration to avoid clearing the param before it's read)
  useEffect(() => {
    if (!hydrated) return;
    const url = new URL(window.location.href);
    if (currentConversationId) {
      url.searchParams.set("id", currentConversationId);
    } else {
      url.searchParams.delete("id");
    }
    window.history.replaceState({}, "", url.toString());
  }, [currentConversationId, hydrated]);

  const currentConversation =
    conversations.find((c) => c.id === currentConversationId) ?? null;

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
    // Optimistic local update
    setConversations((prev) => [conv, ...prev]);
    setCurrentConversationId(conv.id);

    // Background persist
    fetch('/api/db/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conv),
    }).catch(console.error);

    return conv;
  }, []);

  const updateConversation = useCallback((conv: Conversation) => {
    const updated = { ...conv, updatedAt: Date.now() };
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? updated : c))
    );

    // Debounced persist
    pendingUpdates.current.set(conv.id, updated);
    scheduleFlush();
  }, []);

  const updateConversationById = useCallback(
    (id: string, updater: (conv: Conversation) => Conversation) => {
      let updated: Conversation | null = null;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          updated = { ...updater(c), updatedAt: Date.now() };
          return updated;
        })
      );

      // Debounced persist
      if (updated) {
        pendingUpdates.current.set(id, updated);
        scheduleFlush();
      }
    },
    []
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) setCurrentConversationId(null);

      fetch(`/api/db/conversations/${id}`, { method: 'DELETE' }).catch(console.error);
    },
    [currentConversationId]
  );

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);

    fetch('/api/db/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    }).catch(console.error);
  }, []);

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

    fetch(`/api/db/conversations/${targetId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(a),
    }).catch(console.error);
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

    fetch(`/api/db/conversations/${currentConversationId}/activities`, {
      method: 'DELETE',
    }).catch(console.error);
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
      {hydrated ? children : null}
    </AppContext.Provider>
  );
}
