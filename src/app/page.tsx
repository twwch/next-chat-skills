"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useApp } from "@/providers/AppProvider";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RightPanel } from "@/components/layout/RightPanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { InputArea } from "@/components/chat/InputArea";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useSkills } from "@/hooks/useSkills";
import type { Attachment, Conversation, FileBlockData, Message, SkillInvocation, TerminalData, ReferenceData, SubagentData } from "@/types";

interface FileBlock {
  filePath: string;
  content: string;
}

// Inline external CSS <link> and JS <script src> references using sibling file content.
// This makes the HTML preview self-contained in the srcDoc iframe.
function inlineExternalResources(html: string, siblingFiles: Map<string, string>): string {
  // Inline <link rel="stylesheet" href="...">
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel=["']stylesheet["']/i.test(tag)) return tag;
    const hrefMatch = /href=["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch) return tag;
    const filename = hrefMatch[1].replace(/^\.\//, "").split("/").pop() || "";
    const css = siblingFiles.get(filename);
    if (css) return `<style>\n${css}</style>`;
    return tag;
  });

  // Inline <script src="..."></script>
  html = html.replace(/<script\b([^>]*)><\/script>/gi, (tag, attrs: string) => {
    const srcMatch = /src=["']([^"']+)["']/i.exec(attrs);
    if (!srcMatch) return tag;
    const filename = srcMatch[1].replace(/^\.\//, "").split("/").pop() || "";
    const js = siblingFiles.get(filename);
    if (js) return `<script>\n${js}</script>`;
    return tag;
  });

  return html;
}

// Backreference ensures opening and closing use the same number of backticks (4+).
// The LLM now uses 6 backticks; old messages used 4. Both are matched.
const FILE_BLOCK_RE = /(`{4,})file:([^\n]+)\n([\s\S]*?)\1/g;
const FILE_LANG_MAP: Record<string, string> = {
  html: "html", htm: "html", css: "css", js: "javascript",
  ts: "typescript", jsx: "jsx", tsx: "tsx", py: "python",
  json: "json", md: "markdown", sh: "bash", yaml: "yaml", yml: "yaml",
};

// Count the longest consecutive backtick run in a string
function maxConsecutiveBackticks(str: string): number {
  let max = 0;
  let cur = 0;
  for (const ch of str) {
    if (ch === "`") { cur++; if (cur > max) max = cur; }
    else cur = 0;
  }
  return max;
}

// Unique marker for file blocks — will be split on in MessageBubble
const FILE_BLOCK_MARKER = "\u00A7FILE_BLOCK\u00A7";

function parseFileBlocks(content: string): {
  cleanContent: string;
  files: FileBlock[];
  fileBlocks: FileBlockData[];
} {
  const files: FileBlock[] = [];
  const fileBlocks: FileBlockData[] = [];

  // First pass: collect all sibling files so HTML previews can inline CSS/JS
  const siblingFiles = new Map<string, string>();
  let m: RegExpExecArray | null;
  const collectRe = new RegExp(FILE_BLOCK_RE.source, FILE_BLOCK_RE.flags);
  while ((m = collectRe.exec(content)) !== null) {
    // m[1]=backticks, m[2]=filePath, m[3]=fileContent
    const p = m[2].trim();
    if (p.startsWith("/tmp/chat-skills-output/")) {
      const name = p.split("/").pop() || "";
      siblingFiles.set(name, m[3]);
    }
  }

  // Second pass: replace file blocks with markers (not markdown code fences)
  let blockIndex = 0;
  const cleanContent = content.replace(
    FILE_BLOCK_RE,
    (_match, _backticks: string, filePath: string, fileContent: string) => {
      const trimmedPath = filePath.trim();
      if (trimmedPath.startsWith("/tmp/chat-skills-output/")) {
        files.push({ filePath: trimmedPath, content: fileContent });
        const ext = trimmedPath.split(".").pop() || "";
        const lang = FILE_LANG_MAP[ext] || ext;
        const filename = trimmedPath.split("/").pop() || "";

        // For HTML files, inline referenced CSS/JS from sibling files for preview
        let displayContent = fileContent;
        if (lang === "html") {
          displayContent = inlineExternalResources(fileContent, siblingFiles);
        }

        fileBlocks.push({ filePath: trimmedPath, content: displayContent, lang, filename });
        const marker = `${FILE_BLOCK_MARKER}${blockIndex}${FILE_BLOCK_MARKER}`;
        blockIndex++;
        return marker;
      }
      return _match;
    }
  );
  return { cleanContent, files, fileBlocks };
}

// Close any unclosed code fences so ReactMarkdown renders them properly during streaming
function closeOpenCodeFences(content: string): string {
  const fencePattern = /^(`{3,})/gm;
  let openFenceLen = 0;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(content)) !== null) {
    const len = match[1].length;
    if (openFenceLen === 0) {
      openFenceLen = len;
    } else if (len >= openFenceLen) {
      openFenceLen = 0;
    }
  }
  if (openFenceLen > 0) {
    return content + "\n" + "`".repeat(openFenceLen);
  }
  return content;
}

async function writeFilesToDisk(files: FileBlock[]): Promise<void> {
  if (files.length === 0) return;
  try {
    await fetch("/api/files-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
  } catch {
    // silently fail - files won't be saved
  }
}

function parseSkillBlocks(content: string, installedSkillNames?: string[]): {
  cleanContent: string;
  invocations: SkillInvocation[];
} {
  const invocations: SkillInvocation[] = [];
  const cleanContent = content.replace(
    /`{3,}skill\s*\n([\s\S]*?)`{3,}/g,
    (_match, block: string) => {
      try {
        const parsed = JSON.parse(block.trim());
        const skillName = parsed.skill || "unknown";

        // Block invocations for skills that don't exist (except "system" which is built-in)
        if (installedSkillNames && skillName !== "system" && !installedSkillNames.includes(skillName)) {
          return `> ⚠️ Skill **${skillName}** is not installed.`;
        }

        if (parsed.action === "subagent" && parsed.prompt && parsed.images) {
          // Subagent invocation (visual inspection via separate AI call)
          invocations.push({
            id: crypto.randomUUID(),
            skillName,
            type: "subagent",
            status: "running",
            subagentPrompt: parsed.prompt,
            subagentImages: parsed.images,
            data: {
              prompt: parsed.prompt,
              images: parsed.images,
            } as SubagentData,
          });
        } else if (parsed.action === "load-reference" && parsed.reference) {
          // Reference loading (on-demand)
          invocations.push({
            id: crypto.randomUUID(),
            skillName,
            type: "reference",
            status: "running",
            reference: parsed.reference,
            data: {
              filename: parsed.reference,
            } as ReferenceData,
          });
        } else if (parsed.action === "command" && parsed.command) {
          // Command-based invocation (e.g. find-skills using npx)
          invocations.push({
            id: crypto.randomUUID(),
            skillName,
            type: "script",
            status: "running",
            command: parsed.command,
            data: {
              command: parsed.command,
              lines: [],
            } as TerminalData,
          });
        } else {
          // Script-based invocation (e.g. ui-ux-pro-max)
          const script: string = parsed.script || "execute";
          const args: string[] = parsed.args || [];
          invocations.push({
            id: crypto.randomUUID(),
            skillName,
            type: "script",
            status: "running",
            scriptPath: script,
            args,
            stdin: parsed.stdin,
            timeout: parsed.timeout,
            data: {
              command: `${script} ${args.map((a: string) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
              lines: [],
            } as TerminalData,
          });
        }
        if (parsed.action === "subagent") {
          return `> 🔍 Subagent inspecting ${parsed.images?.length || 0} image(s) for skill **${skillName}**...`;
        }
        if (parsed.action === "load-reference") {
          return `> Loading reference **${parsed.reference}** from skill **${skillName}**...`;
        }
        return `> Invoking skill **${skillName}**...`;
      } catch {
        return _match;
      }
    }
  );
  return { cleanContent, invocations };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTextContent(msg: any): string {
  // AI SDK v6 UIMessage uses `parts` instead of `content`
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text || "")
      .join("");
  }
  // Fallback for older format
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p: { type: string }) => p.type === "text")
      .map((p: { text?: string }) => p.text || "")
      .join("");
  }
  return "";
}

// Pure helper: append a terminal line to a conversation's invocation
function appendLine(
  conv: Conversation,
  invocationId: string,
  line: TerminalData["lines"][number]
): Conversation {
  return {
    ...conv,
    messages: conv.messages.map((msg): Message => {
      if (!msg.skillInvocations) return msg;
      return {
        ...msg,
        skillInvocations: msg.skillInvocations.map((si): SkillInvocation => {
          if (si.id !== invocationId) return si;
          const data = si.data as TerminalData;
          return {
            ...si,
            data: { ...data, lines: [...data.lines, line] } as TerminalData,
          };
        }),
      };
    }),
  };
}

// Pure helper: update invocation status
function updateInvStatus(
  conv: Conversation,
  invocationId: string,
  newStatus: "success" | "error",
  exitCode?: number
): Conversation {
  return {
    ...conv,
    messages: conv.messages.map((msg): Message => {
      if (!msg.skillInvocations) return msg;
      return {
        ...msg,
        skillInvocations: msg.skillInvocations.map((si): SkillInvocation => {
          if (si.id !== invocationId) return si;
          const data = si.data as TerminalData;
          return {
            ...si,
            status: newStatus,
            data: { ...data, exitCode: exitCode ?? (newStatus === "success" ? 0 : 1) } as TerminalData,
          };
        }),
      };
    }),
  };
}

export default function Home() {
  const {
    currentConversation,
    currentConversationId,
    createConversation,
    updateConversationById,
    settings,
    addActivity,
    loadMoreMessages,
    isLoadingMessages,
  } = useApp();

  const { skills: installedSkills, refreshSkills } = useSkills();
  const installedSkillNames = useMemo(() => installedSkills.map((s) => s.name), [installedSkills]);
  const [showSettings, setShowSettings] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(settings.model || "gpt-4o");
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0 });
  const conversationRef = useRef(currentConversation);
  conversationRef.current = currentConversation;
  const installedSkillNamesRef = useRef(installedSkillNames);
  installedSkillNamesRef.current = installedSkillNames;

  // Sync selectedModel when settings.model changes (e.g. after hydration)
  const prevSettingsModel = useRef(settings.model);
  useEffect(() => {
    if (settings.model && settings.model !== prevSettingsModel.current) {
      prevSettingsModel.current = settings.model;
      setSelectedModel(settings.model);
    }
  }, [settings.model]);

  // Sync tokenUsage when conversation changes
  useEffect(() => {
    if (currentConversation?.tokenUsage) {
      setTokenUsage(currentConversation.tokenUsage);
    } else {
      setTokenUsage({ input: 0, output: 0 });
    }
  }, [currentConversationId, currentConversation?.tokenUsage]);

  // Fetch available models from the configured API
  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.models?.length > 0) {
          setAvailableModels(data.models);
        }
      } catch {
        // Fall back to configured model only
      }
    }
    fetchModels();
    return () => { cancelled = true; };
  }, [settings.openaiApiKey, settings.openaiBaseUrl]);

  // Track which conversation the current send belongs to,
  // so onFinish saves to the correct conversation even if the user switches.
  const sentConvIdRef = useRef<string | null>(null);

  // Map assistant message IDs to conversation IDs for multi-conversation support
  const messageToConvIdRef = useRef<Map<string, string>>(new Map());
  // Queue of pending sends: when a new assistant message appears, map it to the oldest pending convId
  const pendingSendsRef = useRef<string[]>([]);
  // Track which assistant message IDs we've already mapped
  const mappedMessageIdsRef = useRef<Set<string>>(new Set());
  // Store streaming content per conversation so it persists when switching conversations
  // Key: conversationId, Value: { messageId, content }
  const streamingContentRef = useRef<Map<string, { id: string; content: string }>>(new Map());

  // When the user clicks stop, prevent onFinish and skill callbacks from
  // saving duplicate messages or triggering further AI rounds.
  const stoppedRef = useRef(false);

  // Use a ref so the transport body function always reads the latest settings.
  // useChat stores the Chat instance in a useRef and only recreates it when
  // `id` changes — NOT when transport changes. A body function with a ref
  // ensures the latest settings are resolved on each sendMessage call.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;
  const pendingImagesRef = useRef<Array<{ name: string; dataUrl: string }>>([]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => {
          const images = pendingImagesRef.current;
          pendingImagesRef.current = [];
          return {
            settings: {
              ...settingsRef.current,
              model: selectedModelRef.current,
            },
            ...(images.length > 0 ? { images } : {}),
          };
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const {
    messages: chatMessages,
    status,
    sendMessage,
    setMessages,
    stop,
  } = useChat({
    transport,
    id: "main-chat",
    onData: (dataPart) => {
      // Handle custom data parts from the server
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = dataPart as any;
      if (data?.type === "data-usage" && data?.data) {
        const inputTokens = data.data.inputTokens || 0;
        const outputTokens = data.data.outputTokens || 0;

        // Update local state
        setTokenUsage((prev) => ({
          input: prev.input + inputTokens,
          output: prev.output + outputTokens,
        }));

        // Persist to conversation
        const convId = sentConvIdRef.current;
        if (convId) {
          updateConversationById(convId, (conv) => ({
            ...conv,
            tokenUsage: {
              input: (conv.tokenUsage?.input || 0) + inputTokens,
              output: (conv.tokenUsage?.output || 0) + outputTokens,
            },
          }));
        }
      }
    },
    onFinish: ({ message: finishedMsg }) => {
      if (stoppedRef.current) return;
      // Use message-to-conversation mapping for multi-conversation support
      const convId = messageToConvIdRef.current.get(finishedMsg.id) || sentConvIdRef.current;
      if (!convId) return;
      // Clean up the mapping and stored streaming content
      messageToConvIdRef.current.delete(finishedMsg.id);
      streamingContentRef.current.delete(convId);

      const text = getTextContent(finishedMsg as unknown as Record<string, unknown>);
      const { cleanContent: afterSkills, invocations } = parseSkillBlocks(text, installedSkillNamesRef.current);
      const { cleanContent, files, fileBlocks } = parseFileBlocks(afterSkills);

      // Skip empty messages (e.g. onFinish fires after onError with no content)
      if (!cleanContent.trim() && invocations.length === 0 && files.length === 0) return;

      const newMsg: Message = {
        id: finishedMsg.id,
        role: "assistant",
        content: cleanContent,
        timestamp: Date.now(),
        skillInvocations:
          invocations.length > 0 ? invocations : undefined,
        fileBlocks: fileBlocks.length > 0 ? fileBlocks : undefined,
      };

      // Use functional updater to safely append; skip if message already saved (e.g. by handleStop)
      updateConversationById(convId, (conv) => {
        if (conv.messages.some((m) => m.id === newMsg.id)) return conv;
        return { ...conv, messages: [...conv.messages, newMsg] };
      });

      // Write file blocks to disk
      if (files.length > 0) {
        writeFilesToDisk(files);
        const now = new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        for (const f of files) {
          addActivity({
            id: crypto.randomUUID(),
            type: "files",
            color: "blue",
            text: `Saved <strong>${f.filePath.split("/").pop()}</strong>`,
            time: now,
            status: "done",
          }, convId);
        }
      }

      if (invocations.length > 0) {
        for (const inv of invocations) {
          addActivity({
            id: crypto.randomUUID(),
            type: "skill",
            color: "amber",
            text: `Invoked <strong>${inv.skillName}</strong>`,
            time: new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
            status: "running",
          }, convId);
          executeSkillFromInvocation(inv, convId);
        }
      }
    },
    onError: (error) => {
      // Extract meaningful error message
      let errorMsg = error.message || "Request failed";
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed.error) errorMsg = parsed.error;
      } catch {
        // not JSON, use as-is
      }
      const convId = sentConvIdRef.current;

      // Persist error as a normal assistant message so it survives refresh
      if (convId) {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorMsg,
          timestamp: Date.now(),
        };
        updateConversationById(convId, (conv) => ({
          ...conv,
          messages: [...conv.messages, errorMessage],
        }));
      } else {
        // No conversation to persist to — show ephemeral banner as fallback
        setChatError(errorMsg);
      }

      addActivity({
        id: crypto.randomUUID(),
        type: "chat",
        color: "red",
        text: `Error: ${errorMsg}`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      }, convId || undefined);
    },
  });

  // Map new assistant messages to their conversation IDs and store streaming content
  useEffect(() => {
    for (const msg of chatMessages) {
      if (msg.role === "assistant") {
        // Map new messages to conversations
        if (!mappedMessageIdsRef.current.has(msg.id)) {
          mappedMessageIdsRef.current.add(msg.id);
          // Take the oldest pending send from the queue
          const convId = pendingSendsRef.current.shift();
          if (convId) {
            messageToConvIdRef.current.set(msg.id, convId);
          }
        }
        // Store/update streaming content for the mapped conversation
        const convId = messageToConvIdRef.current.get(msg.id);
        if (convId) {
          const content = getTextContent(msg as unknown as Record<string, unknown>);
          streamingContentRef.current.set(convId, { id: msg.id, content });
        }
      }
    }
  }, [chatMessages]);

  const isStreaming = status === "streaming" || status === "submitted";
  // Check if there's streaming content for the current conversation
  const hasStreamingMsgForCurrentConv = isStreaming && (
    // Check if we just sent a message to this conversation (covers gap before assistant response arrives)
    sentConvIdRef.current === currentConversationId ||
    // Check in chatMessages
    chatMessages.some(
      (msg) => msg.role === "assistant" && messageToConvIdRef.current.get(msg.id) === currentConversationId
    ) ||
    // Or check in stored streaming content (when chatMessages was cleared by setMessages)
    streamingContentRef.current.has(currentConversationId!)
  );
  // Consider the conversation "busy" if the AI is streaming for this conversation OR any skill invocations are still running
  const hasRunningInvocations = currentConversation?.messages.some(
    (m) => m.skillInvocations?.some((si) => si.status === "running")
  ) ?? false;
  const isLoading = hasStreamingMsgForCurrentConv || hasRunningInvocations;

  // Sync stored conversation messages into useChat when switching conversations
  // so the AI has full history context when the user sends a new message.
  // Track both conversation ID and setMessages identity to handle cases where
  // useChat creates a new Chat instance (new setMessages) for the same or new ID.
  // IMPORTANT: Skip syncing while any stream is active - calling setMessages
  // during streaming corrupts the AI SDK's internal state.
  const syncStateRef = useRef<{
    convId: string | null;
    setMsgsFn: typeof setMessages | null;
    wasStreaming: boolean;
    streamingConvId: string | null;
  }>({
    convId: null,
    setMsgsFn: null,
    wasStreaming: false,
    streamingConvId: null,
  });
  useEffect(() => {
    // Don't sync while streaming - it corrupts AI SDK state and causes errors
    if (isStreaming) {
      syncStateRef.current.wasStreaming = true;
      syncStateRef.current.streamingConvId = currentConversationId;
      return;
    }

    // After streaming finishes in the SAME conversation, don't resync.
    // The chatMessages already has the correct messages from the stream.
    // Calling setMessages immediately after streaming can corrupt AI SDK state.
    if (syncStateRef.current.wasStreaming &&
        syncStateRef.current.streamingConvId === currentConversationId) {
      syncStateRef.current.wasStreaming = false;
      syncStateRef.current.convId = currentConversationId;
      syncStateRef.current.streamingConvId = null;
      return;
    }
    syncStateRef.current.wasStreaming = false;
    syncStateRef.current.streamingConvId = null;

    if (
      syncStateRef.current.convId === currentConversationId &&
      syncStateRef.current.setMsgsFn === setMessages
    ) {
      return; // Already synced for this conversation + setMessages
    }
    syncStateRef.current = {
      convId: currentConversationId,
      setMsgsFn: setMessages,
      wasStreaming: false,
      streamingConvId: null,
    };

    if (!currentConversation || currentConversation.messages.length === 0) {
      setMessages([]);
      return;
    }

    // Convert our Message format to UIMessage format for the AI SDK hook
    const uiMessages = currentConversation.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
      createdAt: new Date(m.timestamp),
    }));

    setMessages(uiMessages);
  }, [currentConversationId, currentConversation, setMessages, isStreaming]);

  // Keep a stable ref to sendMessage so async callbacks can use the latest version
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Safe wrapper: skip if stopped, catch Chat instance errors (e.g. after stop/unmount)
  const safeSendMessage = useCallback((msg: { text: string }) => {
    if (stoppedRef.current) return;
    try {
      sendMessageRef.current(msg);
    } catch {
      // Chat instance may be in a bad state after stop — ignore
    }
  }, []);

  const executeReferenceLoad = useCallback(
    async (inv: SkillInvocation, convId: string) => {
      try {
        const res = await fetch("/api/skills-reference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skillName: inv.skillName,
            reference: inv.reference,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to load reference" }));
          updateConversationById(convId, (conv) => updateInvStatus(conv, inv.id, "error"));

          const resultContent = `[Reference load error - ${inv.skillName}/${inv.reference}]\nError: ${err.error}\nPlease check the reference filename and try again.`;
          updateConversationById(convId, (conv) => ({
            ...conv,
            messages: [
              ...conv.messages,
              {
                id: crypto.randomUUID(),
                role: "user" as const,
                content: resultContent,
                timestamp: Date.now(),
                isAutomatic: true,
              },
            ],
          }));
          safeSendMessage({ text: resultContent });
          return;
        }

        const data = await res.json();

        // Update invocation with loaded content and mark success
        updateConversationById(convId, (conv) => ({
          ...conv,
          messages: conv.messages.map((msg): Message => {
            if (!msg.skillInvocations) return msg;
            return {
              ...msg,
              skillInvocations: msg.skillInvocations.map((si): SkillInvocation => {
                if (si.id !== inv.id) return si;
                return {
                  ...si,
                  status: "success",
                  data: { filename: inv.reference!, content: data.content } as ReferenceData,
                };
              }),
            };
          }),
        }));

        addActivity({
          id: crypto.randomUUID(),
          type: "skill",
          color: "green",
          text: `Loaded reference <strong>${inv.reference}</strong> from <strong>${inv.skillName}</strong>`,
          time: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          status: "done",
        }, convId);

        // Send reference content back to AI
        const resultContent = `[Reference loaded - ${inv.skillName}/${inv.reference}]\n\`\`\`\n${data.content}\n\`\`\`\nPlease use this reference content to continue the task.`;
        updateConversationById(convId, (conv) => ({
          ...conv,
          messages: [
            ...conv.messages,
            {
              id: crypto.randomUUID(),
              role: "user" as const,
              content: resultContent,
              timestamp: Date.now(),
              isAutomatic: true,
            },
          ],
        }));
        safeSendMessage({ text: resultContent });
      } catch {
        updateConversationById(convId, (conv) => updateInvStatus(conv, inv.id, "error"));
      }
    },
    [addActivity, updateConversationById]
  );

  const executeSubagent = useCallback(
    async (inv: SkillInvocation, convId: string) => {
      try {
        const res = await fetch("/api/skills-subagent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: inv.subagentPrompt,
            images: inv.subagentImages,
            settings: settingsRef.current,
          }),
          signal: AbortSignal.timeout(120000),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Subagent call failed" }));
          updateConversationById(convId, (conv) => updateInvStatus(conv, inv.id, "error"));

          const resultContent = `[Subagent error - ${inv.skillName}]\nError: ${err.error}\nPlease retry or inspect the images manually.`;
          updateConversationById(convId, (conv) => ({
            ...conv,
            messages: [
              ...conv.messages,
              {
                id: crypto.randomUUID(),
                role: "user" as const,
                content: resultContent,
                timestamp: Date.now(),
                isAutomatic: true,
              },
            ],
          }));
          safeSendMessage({ text: resultContent });
          return;
        }

        const data = await res.json();

        // Update invocation with result and mark success
        updateConversationById(convId, (conv) => ({
          ...conv,
          messages: conv.messages.map((msg): Message => {
            if (!msg.skillInvocations) return msg;
            return {
              ...msg,
              skillInvocations: msg.skillInvocations.map((si): SkillInvocation => {
                if (si.id !== inv.id) return si;
                return {
                  ...si,
                  status: "success",
                  data: {
                    ...(si.data as SubagentData),
                    result: data.result,
                  } as SubagentData,
                };
              }),
            };
          }),
        }));

        addActivity({
          id: crypto.randomUUID(),
          type: "skill",
          color: "green",
          text: `Subagent completed for <strong>${inv.skillName}</strong>`,
          time: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          status: "done",
        }, convId);

        // Feed subagent findings back to the AI
        const resultContent = `[Subagent visual inspection result - ${inv.skillName}]\n\`\`\`\n${data.result}\n\`\`\`\nPlease analyze the findings above. If issues were found, fix them and re-verify. If no issues, continue with the task.`;
        updateConversationById(convId, (conv) => ({
          ...conv,
          messages: [
            ...conv.messages,
            {
              id: crypto.randomUUID(),
              role: "user" as const,
              content: resultContent,
              timestamp: Date.now(),
              isAutomatic: true,
            },
          ],
        }));
        safeSendMessage({ text: resultContent });
      } catch (err) {
        updateConversationById(convId, (conv) => updateInvStatus(conv, inv.id, "error"));

        // Notify the AI so the conversation doesn't stall
        const errorMsg = err instanceof Error ? err.message : "Subagent call failed";
        const resultContent = `[Subagent error - ${inv.skillName}]\nError: ${errorMsg}\nPlease retry or inspect the images manually.`;
        updateConversationById(convId, (conv) => ({
          ...conv,
          messages: [
            ...conv.messages,
            {
              id: crypto.randomUUID(),
              role: "user" as const,
              content: resultContent,
              timestamp: Date.now(),
              isAutomatic: true,
            },
          ],
        }));
        safeSendMessage({ text: resultContent });
      }
    },
    [addActivity, updateConversationById]
  );

  const executeSkillFromInvocation = useCallback(
    async (inv: SkillInvocation, convId: string) => {
      // Handle reference loading separately (simple fetch, no SSE)
      if (inv.type === "reference") {
        executeReferenceLoad(inv, convId);
        return;
      }

      // Handle subagent invocations (separate AI call with images)
      if (inv.type === "subagent") {
        executeSubagent(inv, convId);
        return;
      }

      const outputLines: string[] = [];

      try {
        const res = await fetch("/api/skills-execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            inv.command
              ? { skillName: inv.skillName, command: inv.command }
              : {
                  skillName: inv.skillName,
                  scriptPath: inv.scriptPath || (inv.data as TerminalData).command.split(" ")[0],
                  args: inv.args || [],
                  stdin: inv.stdin,
                  timeout: inv.timeout,
                }
          ),
        });

        if (!res.ok || !res.body) {
          updateConversationById(convId, (conv) => updateInvStatus(conv, inv.id, "error"));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            if (!event.startsWith("data: ")) continue;
            const rawData = event.slice(6);
            if (rawData === "[DONE]") continue;

            try {
              const parsed = JSON.parse(rawData);
              if (parsed.type === "line") {
                const line = parsed.line as TerminalData["lines"][number];
                updateConversationById(convId, (conv) => appendLine(conv, inv.id, line));
                // Collect output (skip the command echo line)
                if (line.type !== "cmd") {
                  outputLines.push(line.text);
                }
              } else if (parsed.type === "exit") {
                const exitStatus: "success" | "error" = parsed.code === 0 ? "success" : "error";
                updateConversationById(convId, (conv) =>
                  updateInvStatus(conv, inv.id, exitStatus, parsed.code)
                );
                addActivity({
                  id: crypto.randomUUID(),
                  type: "script",
                  color: parsed.code === 0 ? "green" : "red",
                  text: `Script ${parsed.code === 0 ? "completed" : "failed"} (exit ${parsed.code})`,
                  time: new Date().toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }),
                  status: "done",
                }, convId);

                // Refresh skills list (covers skill install/remove commands)
                refreshSkills();

                // Feed script results back to the AI to continue the task
                // On success: AI uses the output to continue
                // On failure: AI sees the error and can retry with corrected parameters
                {
                  const outputText = outputLines.length > 0
                    ? outputLines.join("\n")
                    : parsed.code === 0
                      ? "(script completed with no output)"
                      : "(script failed with no output)";
                  const invLabel = inv.command || inv.scriptPath || "execute";
                  const resultContent = parsed.code === 0
                    ? `[Skill execution result - ${inv.skillName}/${invLabel}]\n\`\`\`\n${outputText}\n\`\`\`\nPlease continue the task using this output.`
                    : `[Skill execution error - ${inv.skillName}/${invLabel} - exit code ${parsed.code}]\n\`\`\`\n${outputText}\n\`\`\`\nThe script failed. Please analyze the error above and retry with corrected parameters. Do NOT ask the user — fix the issue yourself and invoke the skill again.`;

                  // Save result message to conversation (hidden from UI)
                  updateConversationById(convId, (conv) => ({
                    ...conv,
                    messages: [
                      ...conv.messages,
                      {
                        id: crypto.randomUUID(),
                        role: "user" as const,
                        content: resultContent,
                        timestamp: Date.now(),
                        isAutomatic: true,
                      },
                    ],
                  }));

                  // Trigger AI continuation (or retry on error)
                  safeSendMessage({ text: resultContent });
                }
              }
            } catch {
              // ignore
            }
          }
        }
      } catch {
        updateConversationById(convId, (conv) => updateInvStatus(conv, inv.id, "error"));
      }
    },
    [addActivity, updateConversationById, refreshSkills, executeReferenceLoad, executeSubagent]
  );

  const handleSend = useCallback(
    (content: string, attachments?: Attachment[]) => {
      // If there's an ongoing stream, stop it first and save partial content
      const isCurrentlyStreaming = status === "streaming" || status === "submitted";
      if (isCurrentlyStreaming) {
        stoppedRef.current = true;
        const lastChat = chatMessages[chatMessages.length - 1];
        if (lastChat?.role === "assistant") {
          const prevConvId = messageToConvIdRef.current.get(lastChat.id) || sentConvIdRef.current;
          if (prevConvId) {
            const text = getTextContent(lastChat as unknown as Record<string, unknown>);
            const { cleanContent: afterSkills } = parseSkillBlocks(text, installedSkillNamesRef.current);
            const { cleanContent, files, fileBlocks } = parseFileBlocks(afterSkills);
            // Clean up refs
            streamingContentRef.current.delete(prevConvId);
            messageToConvIdRef.current.delete(lastChat.id);

            const partialMsg: Message = {
              id: lastChat.id,
              role: "assistant",
              content: cleanContent,
              timestamp: Date.now(),
              fileBlocks: fileBlocks.length > 0 ? fileBlocks : undefined,
            };
            updateConversationById(prevConvId, (conv) => {
              if (conv.messages.some((m) => m.id === partialMsg.id)) return conv;
              return { ...conv, messages: [...conv.messages, partialMsg] };
            });

            if (files.length > 0) {
              writeFilesToDisk(files);
            }
          }
        }
        stop();
      }

      stoppedRef.current = false;
      setChatError(null);
      let conv = conversationRef.current;
      let convId = currentConversationId;

      // Build full content: prepend document attachments as context
      let fullContent = content;
      if (attachments) {
        const docParts: string[] = [];
        for (const att of attachments) {
          if (att.type === "document" && att.text) {
            docParts.push(`[Attached: ${att.name}]\n\`\`\`\n${att.text}\n\`\`\``);
          }
          if (att.type === "image" && att.dataUrl) {
            pendingImagesRef.current.push({ name: att.name, dataUrl: att.dataUrl });
          }
        }
        if (docParts.length > 0) {
          fullContent = docParts.join("\n\n") + "\n\n" + content;
        }
      }

      if (!conv) {
        const firstWords = content.split(" ").slice(0, 5).join(" ");
        conv = createConversation(
          firstWords.length > 30 ? firstWords.slice(0, 30) + "..." : firstWords
        );
        convId = conv.id;
        conversationRef.current = conv;
      } else if (conv.title === "New Conversation" && conv.messages.length === 0) {
        // Auto-title from first user message
        const firstWords = content.split(" ").slice(0, 5).join(" ");
        const newTitle = firstWords.length > 30 ? firstWords.slice(0, 30) + "..." : firstWords;
        updateConversationById(conv.id, (c) => ({ ...c, title: newTitle }));
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: fullContent,
        timestamp: Date.now(),
        attachments,
      };

      // Use functional updater to safely append without overwriting concurrent changes
      updateConversationById(convId!, (c) => ({
        ...c,
        messages: [...c.messages, userMsg],
      }));

      // Track which conversation this send belongs to for onFinish
      sentConvIdRef.current = convId!;
      // Add to pending queue for message-to-conversation mapping (supports multiple simultaneous streams)
      pendingSendsRef.current.push(convId!);

      sendMessage({ text: fullContent });
    },
    [createConversation, updateConversationById, sendMessage, currentConversationId, status, chatMessages, stop]
  );

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    // Save whatever has been streamed so far before stopping
    const lastChat = chatMessages[chatMessages.length - 1];
    if (lastChat?.role === "assistant") {
      const convId = messageToConvIdRef.current.get(lastChat.id) || sentConvIdRef.current;
      if (convId) {
        const text = getTextContent(lastChat as unknown as Record<string, unknown>);
        const { cleanContent: afterSkills } = parseSkillBlocks(text, installedSkillNames);
        const { cleanContent, files, fileBlocks } = parseFileBlocks(afterSkills);
        // Clean up streaming content for this conversation
        streamingContentRef.current.delete(convId);
        messageToConvIdRef.current.delete(lastChat.id);

        const partialMsg: Message = {
          id: lastChat.id,
          role: "assistant",
          content: cleanContent,
          timestamp: Date.now(),
          fileBlocks: fileBlocks.length > 0 ? fileBlocks : undefined,
        };
        updateConversationById(convId, (conv) => {
          if (conv.messages.some((m) => m.id === partialMsg.id)) return conv;
          return { ...conv, messages: [...conv.messages, partialMsg] };
        });

        if (files.length > 0) {
          writeFilesToDisk(files);
        }
      }
    }

    // Clear any stuck running invocations (e.g. from restored history)
    // so hasRunningInvocations becomes false and isLoading clears.
    const targetId = currentConversationId;
    if (targetId) {
      updateConversationById(targetId, (conv) => ({
        ...conv,
        messages: conv.messages.map((m) => {
          if (!m.skillInvocations?.some((si) => si.status === "running")) return m;
          return {
            ...m,
            skillInvocations: m.skillInvocations!.map((si) =>
              si.status === "running" ? { ...si, status: "error" as const } : si
            ),
          };
        }),
      }));
    }

    // Clear sentConvIdRef so hasStreamingMsgForCurrentConv becomes false
    sentConvIdRef.current = null;

    stop();
  }, [chatMessages, stop, updateConversationById, currentConversationId, installedSkillNames]);

  // Merge stored messages with streaming chat messages (filter out automatic messages)
  const displayMessages: Message[] =
    currentConversation?.messages.filter((m) => !m.isAutomatic) || [];

  // Find the streaming message that belongs to the current conversation
  // First try chatMessages, then fall back to stored streamingContentRef (for when setMessages clears chatMessages)
  if (isStreaming && currentConversationId) {
    const streamingMsgInChat = chatMessages.find(
      (msg) =>
        msg.role === "assistant" &&
        messageToConvIdRef.current.get(msg.id) === currentConversationId &&
        !displayMessages.find((m) => m.id === msg.id)
    );

    if (streamingMsgInChat) {
      // Message is in chatMessages - use it
      const rawText = getTextContent(streamingMsgInChat as unknown as Record<string, unknown>);
      const { cleanContent: afterFiles, fileBlocks: streamFileBlocks } = parseFileBlocks(rawText);
      const text = closeOpenCodeFences(afterFiles);
      displayMessages.push({
        id: streamingMsgInChat.id,
        role: "assistant",
        content: text,
        timestamp: Date.now(),
        fileBlocks: streamFileBlocks.length > 0 ? streamFileBlocks : undefined,
      });
    } else {
      // Check stored streaming content (for when user switched away and back)
      const storedStreaming = streamingContentRef.current.get(currentConversationId);
      if (storedStreaming && !displayMessages.find((m) => m.id === storedStreaming.id)) {
        const { cleanContent: afterFiles, fileBlocks: streamFileBlocks } = parseFileBlocks(storedStreaming.content);
        const text = closeOpenCodeFences(afterFiles);
        displayMessages.push({
          id: storedStreaming.id,
          role: "assistant",
          content: text,
          timestamp: Date.now(),
          fileBlocks: streamFileBlocks.length > 0 ? streamFileBlocks : undefined,
        });
      }
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenSettings={() => setShowSettings(true)} tokenUsage={tokenUsage} />
        <ChatArea
          messages={displayMessages}
          isLoading={isLoading}
          error={chatError}
          onDismissError={() => setChatError(null)}
          hasMoreMessages={currentConversation?.hasMoreMessages}
          onLoadMore={currentConversationId ? () => loadMoreMessages(currentConversationId) : undefined}
          isLoadingMore={isLoadingMessages}
        />
        <InputArea
          onSend={handleSend}
          isLoading={isLoading}
          onStop={handleStop}
          models={availableModels}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </main>

      <RightPanel />

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
