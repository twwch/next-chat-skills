"use client";

import type { FileDiff } from "@/types";
import { cn } from "@/lib/utils";

export function DiffPreview({ diff }: { diff: FileDiff }) {
  return (
    <div className="border border-border-glass rounded-lg bg-terminal-bg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/5 font-mono text-[11px] text-text-muted">
        <span>{diff.filePath}</span>
        <span>
          +{diff.additions} -{diff.deletions}
        </span>
      </div>
      <div className="font-mono text-xs leading-[1.7]">
        {diff.lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "flex px-3",
              line.type === "add" && "bg-accent-green/[0.08]",
              line.type === "remove" && "bg-accent-red/[0.08]"
            )}
          >
            <span className="w-9 text-right pr-3 text-[#444C56] select-none shrink-0">
              {line.lineNum}
            </span>
            <span
              className={cn(
                "flex-1",
                line.type === "add" && "text-accent-green",
                line.type === "remove" && "text-accent-red",
                line.type === "context" && "text-text-muted"
              )}
            >
              {line.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
