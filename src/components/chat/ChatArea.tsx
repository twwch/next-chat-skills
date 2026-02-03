"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Message } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { Layers, X, AlertCircle } from "lucide-react";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  error?: string | null;
  onDismissError?: () => void;
}

export function ChatArea({ messages, isLoading, error, onDismissError }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Consider "near bottom" if within 100px of the bottom
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-green/20 to-accent-blue/20 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-8 h-8 text-accent-green" />
          </div>
          <h2 className="font-heading text-xl font-semibold mb-2">
            Chat-Skills
          </h2>
          <p className="text-sm text-text-muted max-w-sm">
            Start a conversation and invoke skills to build, design, and deploy.
            Use <kbd className="px-1.5 py-0.5 text-[10px] rounded border border-border-glass bg-bg-glass font-mono">@skill-name</kbd> to
            mention a skill.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={checkNearBottom}
      className="flex-1 overflow-y-auto py-6"
    >
      <div className="max-w-[820px] mx-auto px-6 flex flex-col gap-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="pl-11">
            <div className="w-0.5 h-5 bg-accent-green rounded-sm animate-pulse" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-accent-red/10 border border-accent-red/20">
            <AlertCircle className="w-4 h-4 text-accent-red mt-0.5 shrink-0" />
            <p className="text-sm text-accent-red flex-1">{error}</p>
            {onDismissError && (
              <button onClick={onDismissError} className="text-accent-red/60 hover:text-accent-red transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
