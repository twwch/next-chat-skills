"use client";

import { useState, useRef, useEffect } from "react";
import { useApp } from "@/providers/AppProvider";
import { Settings, Pencil } from "lucide-react";

interface TopBarProps {
  onOpenSettings: () => void;
  tokenUsage?: { input: number; output: number };
}

export function TopBar({ onOpenSettings, tokenUsage }: TopBarProps) {
  const { currentConversation, skills, updateConversationById } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const activeCount = skills.length;

  const startEditing = () => {
    if (!currentConversation) return;
    setEditValue(currentConversation.title);
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const saveTitle = () => {
    if (!currentConversation) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== currentConversation.title) {
      updateConversationById(currentConversation.id, (c) => ({
        ...c,
        title: trimmed,
      }));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") saveTitle();
    if (e.key === "Escape") setIsEditing(false);
  };

  return (
    <div className="h-[52px] flex items-center justify-between px-5 border-b border-border-glass bg-bg-secondary shrink-0">
      <div className="flex items-center gap-3">
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={handleKeyDown}
            className="font-heading text-[15px] font-semibold bg-transparent border-b border-accent-green outline-none text-text-primary w-[300px]"
          />
        ) : (
          <h1
            className="group font-heading text-[15px] font-semibold flex items-center gap-2 cursor-pointer hover:text-accent-green transition-colors"
            onClick={startEditing}
          >
            {currentConversation?.title || "Next-Chat-Skills"}
            {currentConversation && (
              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
            )}
          </h1>
        )}
        {activeCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-[10px] bg-accent-green-dim text-accent-green font-medium">
            {activeCount} skills
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {tokenUsage && (tokenUsage.input > 0 || tokenUsage.output > 0) && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary font-mono">
            <span className="text-accent-green">{tokenUsage.input.toLocaleString()}</span>
            <span>/</span>
            <span className="text-accent-blue">{tokenUsage.output.toLocaleString()}</span>
            <span className="text-text-quaternary">tokens</span>
          </div>
        )}
        <button
          onClick={onOpenSettings}
          className="w-[34px] h-[34px] rounded-lg border border-border-glass bg-transparent text-text-secondary flex items-center justify-center hover:bg-bg-glass hover:text-text-primary hover:border-border-active transition-all cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
