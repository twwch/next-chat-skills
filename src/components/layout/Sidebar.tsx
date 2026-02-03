"use client";

import { useApp } from "@/providers/AppProvider";
import { useSkills } from "@/hooks/useSkills";
import {
  MessageSquare,
  Plus,
  Monitor,
  Code2,
  Wrench,
  HelpCircle,
  Layers,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SKILL_ICONS: Record<string, React.ReactNode> = {
  "ui-ux-pro-max": <Monitor className="w-[18px] h-[18px]" />,
  "code-generator": <Code2 className="w-[18px] h-[18px]" />,
  "deploy-helper": <Wrench className="w-[18px] h-[18px]" />,
  "find-skills": <HelpCircle className="w-[18px] h-[18px]" />,
  "remotion-best-practices": <Layers className="w-[18px] h-[18px]" />,
};

function getRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function Sidebar() {
  const {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    createConversation,
    deleteConversation,
    setActiveSkill,
  } = useApp();
  const { skills } = useSkills();

  return (
    <aside className="w-[260px] min-w-[260px] bg-bg-secondary border-r border-border-glass flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-border-glass">
        <div className="font-heading text-xl font-bold flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-green to-accent-blue flex items-center justify-center">
            <Layers className="w-[18px] h-[18px] text-white" />
          </div>
          Chat-Skills
        </div>
      </div>

      {/* New conversation */}
      <div className="px-3 pt-3">
        <button
          onClick={() => createConversation()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border-glass text-text-muted text-sm hover:border-accent-green hover:text-accent-green transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      {/* Conversations */}
      <div className="py-3 flex-1 overflow-y-auto">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-4 pb-2">
          Conversations
        </div>
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              "group flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors text-sm border-l-2",
              conv.id === currentConversationId
                ? "bg-accent-green-dim text-accent-green border-l-accent-green"
                : "text-text-secondary border-l-transparent hover:bg-bg-glass hover:text-text-primary"
            )}
            onClick={() => setCurrentConversationId(conv.id)}
          >
            <MessageSquare className="w-[18px] h-[18px] shrink-0 opacity-70" />
            <span className="truncate flex-1">{conv.title}</span>
            <span className="text-[11px] font-mono text-text-muted">
              {getRelativeTime(conv.updatedAt)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteConversation(conv.id);
              }}
              className="hidden group-hover:flex w-5 h-5 items-center justify-center text-text-muted hover:text-accent-red transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="px-4 py-6 text-center text-text-muted text-xs">
            No conversations yet
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="border-t border-border-glass py-3 flex flex-col min-h-[140px] max-h-[240px]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-4 pb-2 shrink-0">
          Installed Skills
        </div>
        <div className="overflow-y-auto flex-1">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors text-sm text-text-secondary hover:bg-bg-glass hover:text-text-primary"
              onClick={() => setActiveSkill(skill)}
            >
              {SKILL_ICONS[skill.name] || (
                <Code2 className="w-[18px] h-[18px] opacity-70" />
              )}
              <span className="truncate">{skill.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* User */}
      <div className="mt-auto px-4 py-3 border-t border-border-glass">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center text-sm font-semibold">
            U
          </div>
          <div>
            <div className="text-sm font-medium">User</div>
            <div className="text-[11px] text-text-muted">Local Mode</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
