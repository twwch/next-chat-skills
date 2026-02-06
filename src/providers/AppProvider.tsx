"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import type { Conversation, ConversationMeta, Settings, Skill, ActivityItem, Message } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { getFingerprint } from "@/lib/fingerprint";

const MESSAGES_PER_PAGE = 20;

// Helper to create fetch with fingerprint header when auth is disabled
function createAuthFetch(authEnabled: boolean, fingerprintId: string | null) {
  return (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (!authEnabled && fingerprintId) {
      headers.set('X-Fingerprint-ID', fingerprintId);
    }
    return fetch(url, { ...options, headers });
  };
}

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  isAnonymous?: boolean;
}

interface AppContextType {
  user: User | null;
  authEnabled: boolean;
  conversations: Conversation[];
  currentConversationId: string | null;
  currentConversation: Conversation | null;
  settings: Settings;
  skills: Skill[];
  activities: ActivityItem[];
  activeSkill: Skill | null;
  isLoadingMessages: boolean;
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
  loadMoreMessages: (convId: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [authEnabled, setAuthEnabled] = useState(true);
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationIdState] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [fingerprintId, setFingerprintId] = useState<string | null>(null);

  // Load auth config on mount
  useEffect(() => {
    fetch('/api/auth-config')
      .then(res => res.json())
      .then(data => {
        setAuthEnabled(data.authEnabled);
        setAuthConfigLoaded(true);
        // If auth is disabled, generate fingerprint
        if (!data.authEnabled) {
          setFingerprintId(getFingerprint());
        }
      })
      .catch(() => {
        setAuthConfigLoaded(true);
      });
  }, []);

  // Determine user based on auth status
  const user: User | null = authEnabled
    ? (session?.user ? {
        id: session.user.id as string,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      } : null)
    : (fingerprintId ? {
        id: fingerprintId,
        name: 'Anonymous User',
        isAnonymous: true,
      } : null);

  // Create authenticated fetch function
  const authFetch = useMemo(
    () => createAuthFetch(authEnabled, fingerprintId),
    [authEnabled, fingerprintId]
  );

  // Track which conversations are currently loading messages to avoid duplicate requests
  const loadingConvIds = useRef<Set<string>>(new Set());

  // Debounce mechanism for rapid conversation updates (e.g., during skill streaming)
  const pendingUpdates = useRef<Map<string, Conversation>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Need to use ref for authFetch in scheduleFlush to avoid stale closure
  const authFetchRef = useRef(authFetch);
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  function scheduleFlush() {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(async () => {
      flushTimer.current = null;
      const updates = new Map(pendingUpdates.current);
      pendingUpdates.current.clear();
      for (const [id, conv] of updates) {
        authFetchRef.current(`/api/db/conversations/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(conv),
        }).catch(console.error);
      }
    }, 300);
  }

  // Load messages for a conversation (first page)
  const loadMessagesForConversation = useCallback(async (convId: string) => {
    if (loadingConvIds.current.has(convId)) return;
    loadingConvIds.current.add(convId);
    setIsLoadingMessages(true);

    try {
      const res = await authFetch(`/api/db/conversations/${convId}/messages?page=1&limit=${MESSAGES_PER_PAGE}`);
      if (res.ok) {
        const data: { messages: Message[]; total: number; hasMore: boolean } = await res.json();
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: data.messages,
                  messagesLoaded: true,
                  hasMoreMessages: data.hasMore,
                  currentPage: 1,
                  messageCount: data.total,
                }
              : c
          )
        );
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      loadingConvIds.current.delete(convId);
      setIsLoadingMessages(false);
    }
  }, [authFetch]);

  // Load more messages (older messages) for infinite scroll
  const loadMoreMessages = useCallback(async (convId: string): Promise<boolean> => {
    if (loadingConvIds.current.has(convId)) return false;

    const conv = conversations.find((c) => c.id === convId);
    if (!conv || !conv.hasMoreMessages) return false;

    loadingConvIds.current.add(convId);
    setIsLoadingMessages(true);

    try {
      const nextPage = (conv.currentPage || 1) + 1;
      const res = await authFetch(`/api/db/conversations/${convId}/messages?page=${nextPage}&limit=${MESSAGES_PER_PAGE}`);
      if (res.ok) {
        const data: { messages: Message[]; total: number; hasMore: boolean } = await res.json();
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  // Prepend older messages to the beginning
                  messages: [...data.messages, ...c.messages],
                  hasMoreMessages: data.hasMore,
                  currentPage: nextPage,
                }
              : c
          )
        );
        return data.hasMore;
      }
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      loadingConvIds.current.delete(convId);
      setIsLoadingMessages(false);
    }
    return false;
  }, [conversations, authFetch]);

  // Hydrate state from database on mount
  useEffect(() => {
    // Wait for auth config to load
    if (!authConfigLoaded) return;

    // If auth is enabled, wait for session to load
    if (authEnabled) {
      if (status === "loading") return;
      // Don't fetch data if not authenticated (when auth is required)
      if (status === "unauthenticated") {
        setHydrated(true);
        return;
      }
    } else {
      // Auth disabled - wait for fingerprint
      if (!fingerprintId) return;
    }

    async function hydrate() {
      try {
        const [convRes, settingsRes] = await Promise.all([
          authFetch('/api/db/conversations'),
          authFetch('/api/db/settings'),
        ]);
        if (convRes.ok) {
          // Now returns ConversationMeta[] (without messages)
          const metas: ConversationMeta[] = await convRes.json();
          // Convert to Conversation[] with empty messages
          const convs: Conversation[] = metas.map((meta) => ({
            id: meta.id,
            title: meta.title,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
            messages: [],
            activities: meta.activities || [],
            tokenUsage: meta.tokenUsage,
            messageCount: meta.messageCount,
            messagesLoaded: false,
            hasMoreMessages: meta.messageCount > 0,
            currentPage: 0,
          }));
          setConversations(convs);

          // Restore conversation from URL ?id= param
          const urlId = new URLSearchParams(window.location.search).get("id");
          if (urlId && convs.some((c) => c.id === urlId)) {
            setCurrentConversationIdState(urlId);
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
  }, [status, authEnabled, authConfigLoaded, fingerprintId, authFetch]);

  // Wrapper for setCurrentConversationId that also loads messages
  const setCurrentConversationId = useCallback((id: string | null) => {
    setCurrentConversationIdState(id);
    if (id) {
      // Check if messages need to be loaded
      const conv = conversations.find((c) => c.id === id);
      if (conv && !conv.messagesLoaded && conv.messageCount && conv.messageCount > 0) {
        loadMessagesForConversation(id);
      }
    }
  }, [conversations, loadMessagesForConversation]);

  // Also load messages when currentConversationId is set from URL on hydration
  useEffect(() => {
    if (!hydrated || !currentConversationId) return;
    const conv = conversations.find((c) => c.id === currentConversationId);
    if (conv && !conv.messagesLoaded && conv.messageCount && conv.messageCount > 0) {
      loadMessagesForConversation(currentConversationId);
    }
  }, [hydrated, currentConversationId, conversations, loadMessagesForConversation]);

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
      messageCount: 0,
      messagesLoaded: true,
      hasMoreMessages: false,
      currentPage: 1,
    };
    // Optimistic local update
    setConversations((prev) => [conv, ...prev]);
    setCurrentConversationIdState(conv.id);

    // Background persist
    authFetch('/api/db/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conv),
    }).catch(console.error);

    return conv;
  }, [authFetch]);

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
      // Move persist logic inside the callback to ensure it runs after the state update
      // (React 18 batches state updates, so the callback may not run immediately)
      setConversations((prev) => {
        let updated: Conversation | null = null;
        const result = prev.map((c) => {
          if (c.id !== id) return c;
          updated = { ...updater(c), updatedAt: Date.now() };
          return updated;
        });

        // Debounced persist - must be inside callback to ensure updated is set
        if (updated) {
          pendingUpdates.current.set(id, updated);
          scheduleFlush();
        }

        return result;
      });
    },
    []
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) setCurrentConversationId(null);

      authFetch(`/api/db/conversations/${id}`, { method: 'DELETE' }).catch(console.error);
    },
    [currentConversationId, authFetch, setCurrentConversationId]
  );

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);

    authFetch('/api/db/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    }).catch(console.error);
  }, [authFetch]);

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

    authFetch(`/api/db/conversations/${targetId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(a),
    }).catch(console.error);
  }, [currentConversationId, authFetch]);

  const clearActivities = useCallback(() => {
    if (!currentConversationId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConversationId
          ? { ...c, activities: [] }
          : c
      )
    );

    authFetch(`/api/db/conversations/${currentConversationId}/activities`, {
      method: 'DELETE',
    }).catch(console.error);
  }, [currentConversationId, authFetch]);

  return (
    <AppContext.Provider
      value={{
        user,
        authEnabled,
        conversations,
        currentConversationId,
        currentConversation,
        settings,
        skills,
        activities,
        activeSkill,
        isLoadingMessages,
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
        loadMoreMessages,
      }}
    >
      {hydrated ? children : null}
    </AppContext.Provider>
  );
}
