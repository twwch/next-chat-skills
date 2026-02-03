"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/providers/AppProvider";
import type { Settings } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { settings, setSettings } = useApp();
  const [form, setForm] = useState<Settings>({ ...settings });

  // Re-sync form state from context whenever the dialog opens
  useEffect(() => {
    if (open) setForm({ ...settings });
  }, [open, settings]);

  const handleSave = () => {
    setSettings(form);
    onClose();
  };

  const update = (key: keyof Settings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-bg-secondary border-border-glass text-text-primary max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <Field
            label="OpenAI API Key"
            value={form.openaiApiKey}
            onChange={(v) => update("openaiApiKey", v)}
            placeholder="sk-..."
            type="password"
          />
          <Field
            label="API Base URL"
            value={form.openaiBaseUrl}
            onChange={(v) => update("openaiBaseUrl", v)}
            placeholder="https://api.openai.com/v1"
          />
          <Field
            label="Model"
            value={form.model}
            onChange={(v) => update("model", v)}
            placeholder="gpt-4o"
          />
          <Field
            label="Skills Directory"
            value={form.skillsDir}
            onChange={(v) => update("skillsDir", v)}
            placeholder="~/.claude/skills"
          />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border-glass text-text-secondary hover:bg-bg-glass transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-accent-green text-white font-medium hover:bg-green-600 transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-border-glass bg-bg-card text-text-primary placeholder:text-text-muted outline-none focus:border-accent-green transition-colors font-mono"
      />
    </div>
  );
}
