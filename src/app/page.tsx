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
  } = useApp();

  const { skills: installedSkills, refreshSkills } = useSkills();
  const installedSkillNames = useMemo(() => installedSkills.map((s) => s.name), [installedSkills]);
  const [showSettings, setShowSettings] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(settings.model || "gpt-4o");
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
    onFinish: ({ message: finishedMsg }) => {
      if (stoppedRef.current) return;
      const convId = sentConvIdRef.current;
      if (!convId) return;

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

  const isStreaming = status === "streaming" || status === "submitted";
  // Consider the conversation "busy" if the AI is streaming OR any skill invocations are still running
  const hasRunningInvocations = currentConversation?.messages.some(
    (m) => m.skillInvocations?.some((si) => si.status === "running")
  ) ?? false;
  const isLoading = isStreaming || hasRunningInvocations;

  // Sync stored conversation messages into useChat when switching conversations
  // so the AI has full history context when the user sends a new message.
  // Track both conversation ID and setMessages identity to handle cases where
  // useChat creates a new Chat instance (new setMessages) for the same or new ID.
  const syncStateRef = useRef<{ convId: string | null; setMsgsFn: typeof setMessages | null }>({
    convId: null,
    setMsgsFn: null,
  });
  useEffect(() => {
    if (
      syncStateRef.current.convId === currentConversationId &&
      syncStateRef.current.setMsgsFn === setMessages
    ) {
      return; // Already synced for this conversation + setMessages
    }
    syncStateRef.current = { convId: currentConversationId, setMsgsFn: setMessages };

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
  }, [currentConversationId, currentConversation, setMessages]);

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

      sendMessage({ text: fullContent });
    },
    [createConversation, updateConversationById, sendMessage, currentConversationId]
  );

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    // Save whatever has been streamed so far before stopping
    const lastChat = chatMessages[chatMessages.length - 1];
    if (lastChat?.role === "assistant") {
      const convId = sentConvIdRef.current;
      if (convId) {
        const text = getTextContent(lastChat as unknown as Record<string, unknown>);
        const { cleanContent: afterSkills } = parseSkillBlocks(text, installedSkillNames);
        const { cleanContent, files, fileBlocks } = parseFileBlocks(afterSkills);

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

    stop();
  }, [chatMessages, stop, updateConversationById, currentConversationId, installedSkillNames]);

  // Merge stored messages with streaming chat messages (filter out automatic messages)
  const displayMessages: Message[] =
    currentConversation?.messages.filter((m) => !m.isAutomatic) || [];

  const lastChat = chatMessages[chatMessages.length - 1];
  if (
    isLoading &&
    lastChat?.role === "assistant" &&
    !displayMessages.find((m) => m.id === lastChat.id)
  ) {
    const rawText = getTextContent(lastChat as unknown as Record<string, unknown>);
    // Convert completed file blocks to markers, then close any unclosed fences in remaining text
    const { cleanContent: afterFiles, fileBlocks: streamFileBlocks } = parseFileBlocks(rawText);
    const text = closeOpenCodeFences(afterFiles);
    displayMessages.push({
      id: lastChat.id,
      role: "assistant",
      content: text,
      timestamp: Date.now(),
      fileBlocks: streamFileBlocks.length > 0 ? streamFileBlocks : undefined,
    });
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenSettings={() => setShowSettings(true)} />
        <ChatArea messages={displayMessages} isLoading={isLoading} error={chatError} onDismissError={() => setChatError(null)} />
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
