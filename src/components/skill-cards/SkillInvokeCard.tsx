"use client";

import { useState } from "react";
import type { SkillInvocation, TerminalData, DepsData, FilesData, ReferenceData, SubagentData } from "@/types";
import { TerminalPanel } from "./TerminalPanel";
import { DepsPanel } from "./DepsPanel";
import { FilesPanel } from "./FilesPanel";
import {
  Terminal,
  Package,
  FolderOpen,
  Check,
  Loader2,
  AlertCircle,
  Clock,
  FileText,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_CONFIG = {
  script: {
    icon: <Terminal className="w-4 h-4" />,
    color: "bg-accent-green-dim text-accent-green",
    label: "Script Execution",
  },
  deps: {
    icon: <Package className="w-4 h-4" />,
    color: "bg-accent-blue-dim text-accent-blue",
    label: "Installing Dependencies",
  },
  files: {
    icon: <FolderOpen className="w-4 h-4" />,
    color: "bg-accent-purple-dim text-accent-purple",
    label: "Application Files",
  },
  reference: {
    icon: <FileText className="w-4 h-4" />,
    color: "bg-accent-cyan-dim text-accent-cyan",
    label: "Loading Reference",
  },
  subagent: {
    icon: <Search className="w-4 h-4" />,
    color: "bg-accent-purple-dim text-accent-purple",
    label: "Visual Inspection",
  },
};

const STATUS_BADGE = {
  running: {
    className: "bg-accent-blue-dim text-accent-blue",
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    label: "Running",
  },
  success: {
    className: "bg-accent-green-dim text-accent-green",
    icon: <Check className="w-3 h-3" />,
    label: "Done",
  },
  error: {
    className: "bg-accent-red-dim text-accent-red",
    icon: <AlertCircle className="w-3 h-3" />,
    label: "Error",
  },
};

export function SkillInvokeCard({
  invocation,
}: {
  invocation: SkillInvocation;
}) {
  const config = TYPE_CONFIG[invocation.type];
  const badge = STATUS_BADGE[invocation.status];
  const [activeTab, setActiveTab] = useState(0);

  const tabs = getTabs(invocation);

  return (
    <div className="mt-3 border border-border-glass rounded-2xl bg-bg-card overflow-hidden glass">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-glass bg-bg-glass">
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center",
            config.color
          )}
        >
          {config.icon}
        </div>
        <span className="font-heading text-[13px] font-semibold">
          {config.label}
        </span>
        <span
          className={cn(
            "ml-auto text-[11px] px-2 py-0.5 rounded-[10px] font-medium font-mono flex items-center gap-1",
            badge.className
          )}
        >
          {badge.icon}
          {badge.label}
        </span>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex border-b border-border-glass bg-white/[0.02]">
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={cn(
                "px-3.5 py-2 text-xs flex items-center gap-1.5 border-b-2 transition-all cursor-pointer",
                i === activeTab
                  ? "text-accent-green border-b-accent-green"
                  : "text-text-muted border-b-transparent hover:text-text-secondary"
              )}
            >
              {tab.icon}
              {tab.label}
              {"count" in tab && tab.count !== undefined && (
                <span
                  className={cn(
                    "font-mono text-[10px] px-1.5 rounded-lg",
                    i === activeTab
                      ? "bg-accent-green-dim text-accent-green"
                      : "bg-bg-glass"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div>{tabs[activeTab]?.content}</div>

      {/* Stats footer for scripts */}
      {invocation.type === "script" && invocation.status !== "running" && (
        <div className="flex gap-4 px-4 py-2.5 border-t border-border-glass bg-white/[0.02]">
          <Stat
            icon={<Clock className="w-3 h-3" />}
            value={`${(((invocation.data as TerminalData).duration || 0) / 1000).toFixed(1)}s`}
          />
          <Stat
            icon={<Terminal className="w-3 h-3" />}
            value={`exit ${(invocation.data as TerminalData).exitCode ?? "?"}`}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
      {icon}
      <span className="font-mono font-semibold text-text-secondary">
        {value}
      </span>
    </div>
  );
}

function getTabs(invocation: SkillInvocation) {
  switch (invocation.type) {
    case "script":
      return [
        {
          label: "Terminal",
          icon: <Terminal className="w-3.5 h-3.5" />,
          content: (
            <TerminalPanel
              data={invocation.data as TerminalData}
              isRunning={invocation.status === "running"}
            />
          ),
        },
      ];
    case "deps":
      return [
        {
          label: "Packages",
          icon: <Package className="w-3.5 h-3.5" />,
          count: (invocation.data as DepsData).packages.length,
          content: <DepsPanel data={invocation.data as DepsData} />,
        },
      ];
    case "files":
      return [
        {
          label: "Files",
          icon: <FolderOpen className="w-3.5 h-3.5" />,
          count: (invocation.data as FilesData).files.filter(
            (f) => f.type === "file"
          ).length,
          content: <FilesPanel data={invocation.data as FilesData} />,
        },
        ...(invocation.data as FilesData).diffs?.length
          ? [
              {
                label: "Diff",
                icon: <FileText className="w-3.5 h-3.5" />,
                count: (invocation.data as FilesData).diffs?.length,
                content: <FilesPanel data={invocation.data as FilesData} />,
              },
            ]
          : [],
      ];
    case "reference": {
      const refData = invocation.data as ReferenceData;
      return [
        {
          label: refData.filename || "Reference",
          icon: <FileText className="w-3.5 h-3.5" />,
          content: (
            <div className="px-4 py-3 text-xs text-text-secondary">
              {refData.content ? (
                <pre className="whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {refData.content}
                </pre>
              ) : (
                <span className="text-text-muted">Loading...</span>
              )}
            </div>
          ),
        },
      ];
    }
    case "subagent": {
      const saData = invocation.data as SubagentData;
      return [
        {
          label: "Inspection",
          icon: <Search className="w-3.5 h-3.5" />,
          content: (
            <div className="px-4 py-3 text-xs text-text-secondary">
              {saData.result ? (
                <pre className="whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {saData.result}
                </pre>
              ) : (
                <div className="flex items-center gap-2 text-text-muted">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Inspecting {saData.images.length} image(s)...</span>
                </div>
              )}
            </div>
          ),
        },
      ];
    }
    default:
      return [];
  }
}
