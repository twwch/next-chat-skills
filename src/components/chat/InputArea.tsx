"use client";

import { useState, useRef, useCallback } from "react";
import { useApp } from "@/providers/AppProvider";
import { Paperclip, Mic, Send, Plus, Code2, Monitor, Wrench } from "lucide-react";

const SKILL_CHIP_ICONS: Record<string, React.ReactNode> = {
  "code-generator": <Code2 className="w-3.5 h-3.5" />,
  "ui-ux-pro-max": <Monitor className="w-3.5 h-3.5" />,
  "deploy-helper": <Wrench className="w-3.5 h-3.5" />,
};

interface InputAreaProps {
  onSend: (content: string) => void;
  isLoading: boolean;
}

export function InputArea({ onSend, isLoading }: InputAreaProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { skills } = useApp();

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore Enter during IME composition (e.g. Chinese/Japanese input)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  };

  const insertSkillMention = (name: string) => {
    setText((prev) => prev + `@${name} `);
    textareaRef.current?.focus();
  };

  return (
    <div className="px-6 pt-4 pb-5 border-t border-border-glass bg-bg-secondary shrink-0">
      <div className="max-w-[820px] mx-auto">
        {/* Skill chips */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[11px] text-text-muted font-medium shrink-0">
            Skills:
          </span>
          {skills.slice(0, 5).map((skill) => (
            <button
              key={skill.name}
              onClick={() => insertSkillMention(skill.name)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border-glass bg-bg-card text-xs text-text-secondary hover:border-accent-green hover:text-accent-green hover:bg-accent-green-dim transition-all cursor-pointer whitespace-nowrap"
            >
              {SKILL_CHIP_ICONS[skill.name] || <Code2 className="w-3.5 h-3.5" />}
              {skill.name}
            </button>
          ))}
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-border-glass text-xs text-text-muted hover:text-text-secondary transition-all cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {/* Input box */}
        <div className="flex items-end gap-2 px-3.5 py-2.5 rounded-2xl border border-border-glass bg-bg-card glass focus-within:border-accent-green transition-colors">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            rows={1}
            placeholder="Message Chat-Skills... (use @ to invoke a skill)"
            className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm leading-relaxed resize-none min-h-[22px] max-h-[120px] placeholder:text-text-muted font-sans"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button className="w-8 h-8 rounded-lg bg-transparent text-text-muted flex items-center justify-center hover:bg-bg-glass hover:text-text-primary transition-all cursor-pointer">
              <Paperclip className="w-[18px] h-[18px]" />
            </button>
            <button className="w-8 h-8 rounded-lg bg-transparent text-text-muted flex items-center justify-center hover:bg-bg-glass hover:text-text-primary transition-all cursor-pointer">
              <Mic className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={handleSend}
              disabled={!text.trim() || isLoading}
              className="w-8 h-8 rounded-lg bg-accent-green text-white flex items-center justify-center hover:bg-green-600 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hints */}
        <div className="flex items-center justify-between mt-2 text-[11px] text-text-muted">
          <span>
            <kbd className="px-1 py-px rounded border border-border-glass bg-bg-glass font-mono text-[10px]">
              Enter
            </kbd>{" "}
            to send,{" "}
            <kbd className="px-1 py-px rounded border border-border-glass bg-bg-glass font-mono text-[10px]">
              Shift+Enter
            </kbd>{" "}
            for new line
          </span>
          <span>Powered by Chat-Skills Engine</span>
        </div>
      </div>
    </div>
  );
}
