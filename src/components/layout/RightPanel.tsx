"use client";

import { useMemo } from "react";
import { useApp } from "@/providers/AppProvider";
import {
  Layers,
  Code2,
  Check,
  Package,
  Clock,
  FileText,
  Terminal,
} from "lucide-react";
import type { ActivityItem } from "@/types";

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  green: <Check className="w-2.5 h-2.5" />,
  blue: <Package className="w-2.5 h-2.5" />,
  amber: <Terminal className="w-2.5 h-2.5" />,
  purple: <Clock className="w-2.5 h-2.5" />,
  red: <FileText className="w-2.5 h-2.5" />,
};

const DOT_COLORS: Record<string, string> = {
  green: "bg-accent-green-dim text-accent-green",
  blue: "bg-accent-blue-dim text-accent-blue",
  amber: "bg-accent-amber-dim text-accent-amber",
  purple: "bg-accent-purple-dim text-accent-purple",
  red: "bg-accent-red-dim text-accent-red",
};

export function RightPanel() {
  const { activeSkill, activities, skills, currentConversation } = useApp();

  // Compute session stats from activities
  const stats = useMemo(() => {
    let skillsCalled = 0;
    let scriptsRun = 0;
    let filesChanged = 0;
    let depsInstalled = 0;
    for (const a of activities) {
      if (a.type === "skill") skillsCalled++;
      if (a.type === "script") scriptsRun++;
      if (a.type === "files") filesChanged++;
      if (a.type === "deps") depsInstalled++;
    }
    return { skillsCalled, scriptsRun, filesChanged, depsInstalled };
  }, [activities]);

  // Find the last time a skill was invoked for "Last Used"
  const lastUsedTime = useMemo(() => {
    const skillActivities = activities.filter((a) => a.type === "skill");
    if (skillActivities.length === 0) return null;
    return skillActivities[skillActivities.length - 1].time;
  }, [activities]);

  return (
    <aside className="w-[300px] min-w-[300px] bg-bg-secondary border-l border-border-glass flex flex-col overflow-y-auto h-full">
      <div className="px-4 py-3.5 border-b border-border-glass font-heading text-[13px] font-semibold flex items-center gap-2">
        <Layers className="w-4 h-4 text-accent-green" />
        Skill Context
      </div>

      {/* Active Skill Card */}
      {activeSkill ? (
        <div className="m-3 p-3.5 rounded-xl border border-border-glass bg-bg-card">
          <div className="w-9 h-9 rounded-lg bg-accent-green-dim text-accent-green flex items-center justify-center mb-2.5">
            <Code2 className="w-5 h-5" />
          </div>
          <div className="font-heading text-sm font-semibold mb-1">
            {activeSkill.name}
          </div>
          <div className="text-xs text-text-muted leading-relaxed mb-3 line-clamp-3">
            {activeSkill.description}
          </div>
          <div className="space-y-0">
            <MetaRow
              label="Version"
              value={activeSkill.version || "1.0.0"}
            />
            <MetaRow
              label="Scripts"
              value={`${activeSkill.scripts?.length || 0} available`}
            />
            <MetaRow
              label="Last Used"
              value={lastUsedTime || "just now"}
            />
            <MetaRow
              label="Status"
              value="active"
              valueColor="text-accent-green"
            />
          </div>
        </div>
      ) : (
        <div className="m-3 p-6 text-center text-text-muted text-xs">
          Click a skill in the sidebar to view details
        </div>
      )}

      {/* Activity Timeline */}
      {activities.length > 0 && (
        <div className="px-4 pb-4">
          <div className="text-xs font-semibold text-text-secondary mb-2.5 pt-3 border-t border-border-glass">
            Activity Timeline
          </div>
          {activities.map((item, i) => (
            <ActivityRow
              key={item.id}
              item={item}
              isLast={i === activities.length - 1}
            />
          ))}
        </div>
      )}

      {/* Session Stats */}
      <div className="m-3 mt-auto p-3.5 rounded-xl border border-border-glass bg-bg-card">
        <div className="font-heading text-xs font-semibold mb-2">
          Session Stats
        </div>
        <MetaRow label="Skills Called" value={String(stats.skillsCalled)} />
        <MetaRow label="Scripts Run" value={String(stats.scriptsRun)} />
        <MetaRow label="Files Changed" value={String(stats.filesChanged)} />
        <MetaRow
          label="Deps Installed"
          value={
            stats.depsInstalled > 0
              ? String(stats.depsInstalled)
              : String(currentConversation?.messages.length || 0)
          }
        />
      </div>
    </aside>
  );
}

function MetaRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-border-glass text-xs">
      <span className="text-text-muted">{label}</span>
      <span
        className={`font-mono text-[11px] ${valueColor || "text-text-secondary"}`}
      >
        {value}
      </span>
    </div>
  );
}

function ActivityRow({
  item,
  isLast,
}: {
  item: ActivityItem;
  isLast: boolean;
}) {
  const statusText =
    item.status === "running" ? " \u2014 running" : item.status === "done" ? "" : "";

  return (
    <div className="flex gap-2.5 py-1.5 relative">
      {!isLast && (
        <div className="absolute left-[9px] top-[26px] bottom-[-2px] w-px bg-border-glass" />
      )}
      <div
        className={`w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 z-[1] ${DOT_COLORS[item.color]}`}
      >
        {ACTIVITY_ICONS[item.color]}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-xs text-text-secondary leading-snug"
          dangerouslySetInnerHTML={{ __html: item.text }}
        />
        <div className="text-[10px] text-text-muted mt-0.5">
          {item.time}
          {statusText && (
            <span className={item.status === "running" ? "text-accent-amber" : ""}>
              {statusText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
