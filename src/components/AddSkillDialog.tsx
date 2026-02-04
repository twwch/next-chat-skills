"use client";

import { useState, useRef, useCallback } from "react";
import type { TerminalData, TerminalLine } from "@/types";
import { TerminalPanel } from "./skill-cards/TerminalPanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddSkillDialogProps {
  open: boolean;
  onClose: () => void;
  onInstalled: () => void;
}

type DialogPhase = "input" | "installing" | "success" | "error";

const COMMAND_REGEX = /^npx\s+skills\s+add\s+\S+/;

function validateCommand(cmd: string): string | null {
  const trimmed = cmd.trim();
  if (!trimmed) return "Please enter an install command";
  if (!COMMAND_REGEX.test(trimmed)) {
    return "Command format: npx skills add <owner/repo[@branch]>";
  }
  return null;
}

export function AddSkillDialog({ open, onClose, onInstalled }: AddSkillDialogProps) {
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<DialogPhase>("input");
  const [terminalData, setTerminalData] = useState<TerminalData>({
    command: "",
    lines: [],
  });
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setCommand("");
    setError(null);
    setPhase("input");
    setTerminalData({ command: "", lines: [] });
    abortRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    if (phase === "installing" && abortRef.current) {
      abortRef.current.abort();
    }
    reset();
    onClose();
  }, [phase, reset, onClose]);

  const appendLine = useCallback((line: TerminalLine) => {
    setTerminalData((prev) => ({
      ...prev,
      lines: [...prev.lines, line],
    }));
  }, []);

  const handleInstall = useCallback(async () => {
    const validationError = validateCommand(command);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setPhase("installing");
    setTerminalData({ command: command.trim(), lines: [] });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/skills-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillName: "system",
          command: command.trim(),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setPhase("error");
        appendLine({ type: "error", text: "Failed to start installation" });
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
              appendLine(parsed.line as TerminalLine);
            } else if (parsed.type === "exit") {
              const exitCode = parsed.code ?? 1;
              setTerminalData((prev) => ({ ...prev, exitCode }));
              if (exitCode === 0) {
                setPhase("success");
                onInstalled();
              } else {
                setPhase("error");
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setPhase("error");
      appendLine({ type: "error", text: "Installation failed unexpectedly" });
    }
  }, [command, appendLine, onInstalled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && phase === "input") {
      e.preventDefault();
      handleInstall();
    }
  };

  const isInstalling = phase === "installing";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className={cn(
          "border-border-glass text-text-primary",
          phase === "input"
            ? "bg-bg-secondary max-w-lg p-6"
            : "bg-bg-secondary max-w-2xl p-0 gap-0 overflow-hidden"
        )}
        showCloseButton={phase === "input"}
      >
        {/* Input phase */}
        {phase === "input" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-lg flex items-center gap-2">
                <Download className="w-5 h-5" />
                Install Skill
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-1">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Install Command
                </label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => {
                    setCommand(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="npx skills add owner/repo@branch"
                  autoFocus
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border-glass bg-bg-card text-text-primary placeholder:text-text-muted outline-none focus:border-accent-green transition-colors font-mono"
                />
                {error && (
                  <p className="mt-1.5 text-xs text-accent-red flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-text-muted">
                Example: npx skills add iamzifei/wechat-article-publisher-skill@wechat-article-publisher
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm rounded-lg border border-border-glass text-text-secondary hover:bg-bg-glass transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInstall}
                  disabled={!command.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-accent-green text-white font-medium hover:bg-green-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Install
                </button>
              </div>
            </div>
          </>
        )}

        {/* Installing / Done phase — single card, no dialog header */}
        {phase !== "input" && (
          <>
            {/* Header bar */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-glass bg-bg-glass">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-green-dim text-accent-green">
                <Download className="w-4 h-4" />
              </div>
              <span className="font-heading text-[13px] font-semibold">
                Installing Skill
              </span>
              {phase === "installing" && (
                <span className="ml-auto shrink-0 text-[11px] px-2 py-0.5 rounded-[10px] font-medium font-mono flex items-center gap-1 bg-accent-blue-dim text-accent-blue">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Running
                </span>
              )}
              {phase === "success" && (
                <span className="ml-auto shrink-0 text-[11px] px-2 py-0.5 rounded-[10px] font-medium font-mono flex items-center gap-1 bg-accent-green-dim text-accent-green">
                  <Check className="w-3 h-3" />
                  Done
                </span>
              )}
              {phase === "error" && (
                <span className="ml-auto shrink-0 text-[11px] px-2 py-0.5 rounded-[10px] font-medium font-mono flex items-center gap-1 bg-accent-red-dim text-accent-red">
                  <AlertCircle className="w-3 h-3" />
                  Error
                </span>
              )}
            </div>

            {/* Terminal output */}
            <TerminalPanel data={terminalData} isRunning={isInstalling} />

            {/* Actions */}
            {!isInstalling && (
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-glass">
                {phase === "error" && (
                  <button
                    onClick={reset}
                    className="px-4 py-2 text-sm rounded-lg border border-border-glass text-text-secondary hover:bg-bg-glass transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm rounded-lg bg-accent-green text-white font-medium hover:bg-green-600 transition-colors cursor-pointer"
                >
                  {phase === "success" ? "Done" : "Close"}
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
