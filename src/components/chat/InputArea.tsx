"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useApp } from "@/providers/AppProvider";
import { Paperclip, Mic, Send, Square, Plus, Code2, Monitor, Wrench, ChevronDown, Bot, Check } from "lucide-react";

const SKILL_CHIP_ICONS: Record<string, React.ReactNode> = {
  "code-generator": <Code2 className="w-3.5 h-3.5" />,
  "ui-ux-pro-max": <Monitor className="w-3.5 h-3.5" />,
  "deploy-helper": <Wrench className="w-3.5 h-3.5" />,
};

interface InputAreaProps {
  onSend: (content: string) => void;
  isLoading: boolean;
  onStop?: () => void;
  models: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function InputArea({ onSend, isLoading, onStop, models, selectedModel, onModelChange }: InputAreaProps) {
  const [text, setText] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { skills } = useApp();

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

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
            {isLoading ? (
              <button
                onClick={onStop}
                className="w-8 h-8 rounded-lg bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!text.trim()}
                className="w-8 h-8 rounded-lg bg-accent-green text-white flex items-center justify-center hover:bg-green-600 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Model selector + hints */}
        <div className="flex items-center justify-between mt-2 text-[11px] text-text-muted">
          {/* Model selector */}
          <div className="relative" ref={modelRef}>
            <button
              onClick={() => setModelOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-bg-glass transition-colors cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="font-medium text-text-secondary">{selectedModel}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {modelOpen && models.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-72 max-h-64 overflow-y-auto rounded-xl border border-white/[0.12] bg-bg-secondary shadow-2xl shadow-black/50 z-50 py-1 backdrop-blur-xl [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
                {models.map((m) => (
                  <button
                    key={m}
                    onClick={() => { onModelChange(m); setModelOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-[12px] hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center gap-2 ${
                      m === selectedModel ? "text-accent-green font-medium" : "text-text-primary"
                    }`}
                  >
                    {m === selectedModel ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{m}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span>Powered by Chat-Skills Engine</span>
        </div>
      </div>
    </div>
  );
}
