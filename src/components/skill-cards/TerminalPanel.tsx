"use client";

import type { TerminalData, TerminalLine } from "@/types";
import { cn } from "@/lib/utils";

const LINE_COLORS: Record<string, string> = {
  prompt: "text-accent-green",
  cmd: "text-text-primary",
  output: "text-text-muted",
  success: "text-accent-green",
  error: "text-accent-red",
  info: "text-accent-blue",
  warn: "text-accent-amber",
};

export function TerminalPanel({
  data,
  isRunning,
}: {
  data: TerminalData;
  isRunning: boolean;
}) {
  return (
    <div className="bg-terminal-bg font-mono text-xs leading-[1.7]">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.03] border-b border-white/5 sticky top-0">
        <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
        <div className="w-2 h-2 rounded-full bg-[#FEBC2E]" />
        <div className="w-2 h-2 rounded-full bg-[#28C840]" />
        {data.cwd && (
          <span className="ml-3 text-[11px] text-text-muted">{data.cwd}</span>
        )}
      </div>

      {/* Terminal body */}
      <div className="p-3.5 max-h-[240px] overflow-y-auto">
        {data.lines.map((line, i) => (
          <TerminalLineRow key={i} line={line} />
        ))}
        {isRunning && <span className="terminal-cursor" />}
      </div>
    </div>
  );
}

function TerminalLineRow({ line }: { line: TerminalLine }) {
  if (line.type === "cmd") {
    return (
      <div className="whitespace-pre-wrap break-all">
        <span className="text-accent-green select-none">$ </span>
        <span className="text-text-primary">{line.text.replace(/^\$ /, "")}</span>
      </div>
    );
  }

  return (
    <div className={cn("whitespace-pre-wrap break-all", LINE_COLORS[line.type] || "text-text-muted")}>
      {line.text}
    </div>
  );
}
