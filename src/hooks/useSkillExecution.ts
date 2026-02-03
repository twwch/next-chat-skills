"use client";

import { useState, useCallback, useRef } from "react";
import type { TerminalLine } from "@/types";

interface ExecutionState {
  isRunning: boolean;
  lines: TerminalLine[];
  exitCode: number | null;
  duration: number | null;
}

export function useSkillExecution() {
  const [state, setState] = useState<ExecutionState>({
    isRunning: false,
    lines: [],
    exitCode: null,
    duration: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (skillName: string, scriptPath: string, args: string[]) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setState({ isRunning: true, lines: [], exitCode: null, duration: null });
      const startTime = Date.now();

      try {
        const res = await fetch("/api/skills-execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillName, scriptPath, args }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          setState((s) => ({
            ...s,
            isRunning: false,
            lines: [
              ...s.lines,
              { type: "error", text: `Error: ${res.statusText}` },
            ],
            exitCode: 1,
            duration: Date.now() - startTime,
          }));
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
            const data = event.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "line") {
                setState((s) => ({
                  ...s,
                  lines: [...s.lines, parsed.line as TerminalLine],
                }));
              } else if (parsed.type === "exit") {
                setState((s) => ({
                  ...s,
                  isRunning: false,
                  exitCode: parsed.code,
                  duration: Date.now() - startTime,
                }));
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        setState((s) => {
          if (s.isRunning) {
            return {
              ...s,
              isRunning: false,
              duration: Date.now() - startTime,
              exitCode: s.exitCode ?? 0,
            };
          }
          return s;
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setState((s) => ({
            ...s,
            isRunning: false,
            lines: [
              ...s.lines,
              { type: "error", text: `Error: ${String(e)}` },
            ],
            exitCode: 1,
            duration: Date.now() - startTime,
          }));
        }
      }
    },
    []
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, isRunning: false }));
  }, []);

  return { ...state, execute, stop };
}
