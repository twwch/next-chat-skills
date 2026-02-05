"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useApp } from "@/providers/AppProvider";
import { useSkills } from "@/hooks/useSkills";
import type { Attachment } from "@/types";
import {
  Paperclip, Send, Square, Plus, Code2, Monitor, Wrench,
  ChevronDown, Bot, Check, X, FileText, Image, Loader2,
} from "lucide-react";
import { AddSkillDialog } from "@/components/AddSkillDialog";

const SKILL_CHIP_ICONS: Record<string, React.ReactNode> = {
  "code-generator": <Code2 className="w-3.5 h-3.5" />,
  "ui-ux-pro-max": <Monitor className="w-3.5 h-3.5" />,
  "deploy-helper": <Wrench className="w-3.5 h-3.5" />,
};

const FILE_ACCEPT = ".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.odt,.odp,.ods,.jpg,.jpeg,.png,.gif,.webp";

interface InputAreaProps {
  onSend: (content: string, attachments?: Attachment[]) => void;
  isLoading: boolean;
  onStop?: () => void;
  models: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function InputArea({ onSend, isLoading, onStop, models, selectedModel, onModelChange }: InputAreaProps) {
  const [text, setText] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { skills } = useApp();
  const { refreshSkills } = useSkills();

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
    if ((!trimmed && attachments.length === 0) || isLoading) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setText("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachments, isLoading, onSend]);

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

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    const results: Attachment[] = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/files-parse", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("File parse error:", err.error || res.statusText);
          continue;
        }
        const data = await res.json();
        results.push({
          name: data.name,
          type: data.type,
          text: data.text,
          dataUrl: data.dataUrl,
        });
      } catch (err) {
        console.error("File upload error:", err);
      }
    }

    if (results.length > 0) {
      setAttachments((prev) => [...prev, ...results]);
    }
    setUploading(false);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    e.target.value = "";
    textareaRef.current?.focus();
  }, [uploadFiles]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      await uploadFiles(imageFiles);
    }
  }, [uploadFiles]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const hasContent = text.trim() || attachments.length > 0;

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
          <button
            onClick={() => setShowAddSkill(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-border-glass text-xs text-text-muted hover:text-text-secondary transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {/* Attachment previews */}
        {(attachments.length > 0 || uploading) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-glass bg-bg-card text-xs text-text-secondary"
              >
                {att.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="w-6 h-6 rounded object-cover"
                  />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-accent-blue" />
                )}
                <span className="max-w-[120px] truncate">{att.name}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-bg-glass text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {uploading && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Parsing...
              </div>
            )}
          </div>
        )}

        {/* Input box */}
        <div className="flex items-end gap-2 px-3.5 py-2.5 rounded-2xl border border-border-glass bg-bg-card glass focus-within:border-accent-green transition-colors">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onInput={handleInput}
            rows={1}
            placeholder="Message Chat-Skills... (use @ to invoke a skill)"
            className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm leading-relaxed resize-none min-h-[22px] max-h-[120px] placeholder:text-text-muted font-sans"
          />
          <div className="flex items-center gap-1 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-lg bg-transparent text-text-muted flex items-center justify-center hover:bg-bg-glass hover:text-text-primary transition-all cursor-pointer"
            >
              <Paperclip className="w-[18px] h-[18px]" />
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
                disabled={!hasContent}
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

      <AddSkillDialog
        open={showAddSkill}
        onClose={() => setShowAddSkill(false)}
        onInstalled={refreshSkills}
      />
    </div>
  );
}
