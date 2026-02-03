"use client";

import { useState } from "react";
import type { FilesData } from "@/types";
import { DiffPreview } from "./DiffPreview";
import { Folder, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_COLORS: Record<string, string> = {
  folder: "text-accent-amber",
  ts: "text-accent-blue",
  tsx: "text-accent-blue",
  js: "text-accent-amber",
  css: "text-accent-purple",
  json: "text-accent-amber",
  md: "text-text-muted",
  py: "text-accent-green",
};

const TAG_STYLES: Record<string, string> = {
  new: "bg-accent-green-dim text-accent-green",
  modified: "bg-accent-amber-dim text-accent-amber",
  deleted: "bg-accent-red-dim text-accent-red",
};

export function FilesPanel({ data }: { data: FilesData }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    data.diffs?.[0]?.filePath ?? null
  );

  const selectedDiff = data.diffs?.find((d) => d.filePath === selectedFile);

  return (
    <div className="p-3.5">
      <div className="font-mono text-xs">
        {data.files.map((node) => (
          <div
            key={node.path}
            className="flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer hover:bg-bg-glass transition-colors"
            style={{ paddingLeft: `${8 + node.depth * 20}px` }}
            onClick={() => {
              if (node.type === "file" && data.diffs?.find((d) => d.filePath === node.path)) {
                setSelectedFile(node.path);
              }
            }}
          >
            {node.type === "folder" ? (
              <Folder
                className={cn("w-4 h-4 shrink-0", ICON_COLORS.folder)}
              />
            ) : (
              <FileText
                className={cn(
                  "w-4 h-4 shrink-0",
                  ICON_COLORS[node.icon || "ts"] || "text-text-muted"
                )}
              />
            )}
            <span className="text-text-secondary">{node.name}</span>
            {node.tag && (
              <span
                className={cn(
                  "ml-auto text-[10px] px-1.5 py-px rounded font-medium",
                  TAG_STYLES[node.tag]
                )}
              >
                {node.tag}
              </span>
            )}
          </div>
        ))}
      </div>

      {selectedDiff && (
        <div className="mt-2">
          <DiffPreview diff={selectedDiff} />
        </div>
      )}
    </div>
  );
}
