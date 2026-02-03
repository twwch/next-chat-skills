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
import type { Conversation, Message, SkillInvocation, TerminalData } from "@/types";

interface FileBlock {
  filePath: string;
  content: string;
}

function parseFileBlocks(content: string): {
  cleanContent: string;
  files: FileBlock[];
} {
  const files: FileBlock[] = [];
  const cleanContent = content.replace(
    /````file:([^\n]+)\n([\s\S]*?)````/g,
    (_match, filePath: string, fileContent: string) => {
      const trimmedPath = filePath.trim();
      if (trimmedPath.startsWith("/tmp/chat-skills-output/")) {
        files.push({ filePath: trimmedPath, content: fileContent });
        // Derive language from file extension for syntax highlighting
        const ext = trimmedPath.split(".").pop() || "";
        const langMap: Record<string, string> = {
          html: "html", htm: "html", css: "css", js: "javascript",
          ts: "typescript", jsx: "jsx", tsx: "tsx", py: "python",
          json: "json", md: "markdown", sh: "bash", yaml: "yaml", yml: "yaml",
        };
        const lang = langMap[ext] || ext;
        return `> **File saved:** \`${trimmedPath}\`\n\n\`\`\`${lang}\n${fileContent}\`\`\``;
      }
      return _match;
    }
  );
  return { cleanContent, files };
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

function parseSkillBlocks(content: string): {
  cleanContent: string;
  invocations: SkillInvocation[];
} {
  const invocations: SkillInvocation[] = [];
  const cleanContent = content.replace(
    /```skill\n([\s\S]*?)```/g,
    (_match, block: string) => {
      try {
        const parsed = JSON.parse(block.trim());
        const skillName = parsed.skill || "unknown";

        if (parsed.action === "command" && parsed.command) {
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
            data: {
              command: `${script} ${args.map((a: string) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
              lines: [],
            } as TerminalData,
          });
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

  const { refreshSkills } = useSkills();
  const [showSettings, setShowSettings] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const conversationRef = useRef(currentConversation);
  conversationRef.current = currentConversation;

  // Track which conversation the current send belongs to,
  // so onFinish saves to the correct conversation even if the user switches.
  const sentConvIdRef = useRef<string | null>(null);

  // Use a ref so the transport body function always reads the latest settings.
  // useChat stores the Chat instance in a useRef and only recreates it when
  // `id` changes — NOT when transport changes. A body function with a ref
  // ensures the latest settings are resolved on each sendMessage call.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ settings: settingsRef.current }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const {
    messages: chatMessages,
    status,
    sendMessage,
    setMessages,
  } = useChat({
    transport,
    id: currentConversationId || undefined,
    onFinish: ({ message: finishedMsg }) => {
      const convId = sentConvIdRef.current;
      if (!convId) return;

      const text = getTextContent(finishedMsg as unknown as Record<string, unknown>);
      const { cleanContent: afterSkills, invocations } = parseSkillBlocks(text);
      const { cleanContent, files } = parseFileBlocks(afterSkills);

      const newMsg: Message = {
        id: finishedMsg.id,
        role: "assistant",
        content: cleanContent,
        timestamp: Date.now(),
        skillInvocations:
          invocations.length > 0 ? invocations : undefined,
      };

      // Use functional updater to safely append without overwriting concurrent changes
      updateConversationById(convId, (conv) => ({
        ...conv,
        messages: [...conv.messages, newMsg],
      }));

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
      setChatError(errorMsg);
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
      }, sentConvIdRef.current || undefined);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

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

  const executeSkillFromInvocation = useCallback(
    async (inv: SkillInvocation, convId: string) => {
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
                  sendMessageRef.current({ text: resultContent });
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
    [addActivity, updateConversationById, refreshSkills]
  );

  const handleSend = useCallback(
    (content: string) => {
      setChatError(null);
      let conv = conversationRef.current;
      let convId = currentConversationId;

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
        content,
        timestamp: Date.now(),
      };

      // Use functional updater to safely append without overwriting concurrent changes
      updateConversationById(convId!, (c) => ({
        ...c,
        messages: [...c.messages, userMsg],
      }));

      // Track which conversation this send belongs to for onFinish
      sentConvIdRef.current = convId!;

      sendMessage({ text: content });
    },
    [createConversation, updateConversationById, sendMessage, currentConversationId]
  );

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
    // Close any unclosed code fences so they render properly during streaming
    const text = closeOpenCodeFences(rawText);
    displayMessages.push({
      id: lastChat.id,
      role: "assistant",
      content: text,
      timestamp: Date.now(),
    });
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenSettings={() => setShowSettings(true)} />
        <ChatArea messages={displayMessages} isLoading={isLoading} error={chatError} onDismissError={() => setChatError(null)} />
        <InputArea onSend={handleSend} isLoading={isLoading} />
      </main>

      <RightPanel />

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
