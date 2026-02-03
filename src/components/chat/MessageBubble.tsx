"use client";

import { useState } from "react";
import type { Message } from "@/types";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SkillInvokeCard } from "@/components/skill-cards/SkillInvokeCard";
import { Code2, FileCode, FileText, FileJson, Braces, Eye } from "lucide-react";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const LANG_DISPLAY: Record<string, { label: string; icon: React.ReactNode }> = {
  html: { label: "HTML", icon: <FileCode className="w-4 h-4" /> },
  css: { label: "CSS", icon: <FileText className="w-4 h-4" /> },
  javascript: { label: "JavaScript", icon: <Braces className="w-4 h-4" /> },
  js: { label: "JavaScript", icon: <Braces className="w-4 h-4" /> },
  typescript: { label: "TypeScript", icon: <FileCode className="w-4 h-4" /> },
  ts: { label: "TypeScript", icon: <FileCode className="w-4 h-4" /> },
  jsx: { label: "JSX", icon: <FileCode className="w-4 h-4" /> },
  tsx: { label: "TSX", icon: <FileCode className="w-4 h-4" /> },
  python: { label: "Python", icon: <Code2 className="w-4 h-4" /> },
  py: { label: "Python", icon: <Code2 className="w-4 h-4" /> },
  json: { label: "JSON", icon: <FileJson className="w-4 h-4" /> },
  bash: { label: "Bash", icon: <Code2 className="w-4 h-4" /> },
  sh: { label: "Shell", icon: <Code2 className="w-4 h-4" /> },
  markdown: { label: "Markdown", icon: <FileText className="w-4 h-4" /> },
  md: { label: "Markdown", icon: <FileText className="w-4 h-4" /> },
  yaml: { label: "YAML", icon: <FileText className="w-4 h-4" /> },
  yml: { label: "YAML", icon: <FileText className="w-4 h-4" /> },
  sql: { label: "SQL", icon: <Code2 className="w-4 h-4" /> },
  xml: { label: "XML", icon: <FileCode className="w-4 h-4" /> },
  vue: { label: "Vue", icon: <FileCode className="w-4 h-4" /> },
  svelte: { label: "Svelte", icon: <FileCode className="w-4 h-4" /> },
};

function getLangInfo(className?: string) {
  if (!className) return null;
  const match = /language-(\S+)/.exec(className);
  if (!match) return null;
  const lang = match[1].toLowerCase();
  return (
    LANG_DISPLAY[lang] || {
      label: lang.toUpperCase(),
      icon: <Code2 className="w-4 h-4" />,
    }
  );
}

function extractTextContent(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  return "";
}

function HtmlCodeBlock({
  children,
  langInfo,
}: {
  children: React.ReactNode;
  langInfo: { label: string; icon: React.ReactNode };
}) {
  const [showPreview, setShowPreview] = useState(false);
  const rawHtml = extractTextContent(children);

  return (
    <div className="not-prose my-3 border border-border-glass rounded-2xl bg-bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border-glass bg-bg-glass">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-blue-dim text-accent-blue">
          {langInfo.icon}
        </div>
        <span className="font-heading text-[13px] font-semibold text-text-primary">
          {langInfo.label}
        </span>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            showPreview
              ? "bg-accent-green/20 text-accent-green border border-accent-green/30"
              : "bg-white/5 text-text-secondary hover:text-accent-green hover:bg-accent-green/10 border border-transparent"
          }`}
        >
          {showPreview ? (
            <Code2 className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          {showPreview ? "Code" : "Preview"}
        </button>
      </div>

      {showPreview ? (
        <div className="bg-white overflow-hidden">
          <iframe
            srcDoc={rawHtml}
            className="w-full h-[400px] border-0"
            sandbox="allow-scripts"
            title="HTML Preview"
          />
        </div>
      ) : (
        <div className="bg-terminal-bg">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.03] border-b border-white/5">
            <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
            <div className="w-2 h-2 rounded-full bg-[#FEBC2E]" />
            <div className="w-2 h-2 rounded-full bg-[#28C840]" />
          </div>
          <pre className="p-3.5 max-h-[400px] overflow-y-auto text-xs font-mono leading-relaxed m-0 bg-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-corner]:bg-transparent">
            <code className="text-text-primary">{children}</code>
          </pre>
          <div className="px-3.5 py-1.5 bg-white/[0.03] border-t border-white/5" />
        </div>
      )}
    </div>
  );
}

const markdownComponents: Components = {
  table: ({ children }) => (
    <div className="not-prose my-3 border border-border-glass rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">{children}</table>
      </div>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-bg-glass border-b border-border-glass">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-border-glass">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{children}</td>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const langInfo = getLangInfo(className);
    if (langInfo) {
      // HTML code blocks get a preview button
      const langMatch = className ? /language-(\S+)/.exec(className) : null;
      const lang = langMatch ? langMatch[1].toLowerCase() : "";
      if (lang === "html" || lang === "htm") {
        return (
          <HtmlCodeBlock langInfo={langInfo}>{children}</HtmlCodeBlock>
        );
      }
      return (
        <div className="not-prose my-3 border border-border-glass rounded-2xl bg-bg-card overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border-glass bg-bg-glass">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-blue-dim text-accent-blue">
              {langInfo.icon}
            </div>
            <span className="font-heading text-[13px] font-semibold text-text-primary">
              {langInfo.label}
            </span>
          </div>
          {/* macOS dots + code */}
          <div className="bg-terminal-bg">
            <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.03] border-b border-white/5">
              <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
              <div className="w-2 h-2 rounded-full bg-[#FEBC2E]" />
              <div className="w-2 h-2 rounded-full bg-[#28C840]" />
            </div>
            <pre className="p-3.5 max-h-[400px] overflow-y-auto text-xs font-mono leading-relaxed m-0 bg-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-corner]:bg-transparent">
              <code className="text-text-primary" {...props}>
                {children}
              </code>
            </pre>
            <div className="px-3.5 py-1.5 bg-white/[0.03] border-t border-white/5" />
          </div>
        </div>
      );
    }
    // Inline code
    return (
      <code
        className="not-prose text-accent-green bg-bg-glass px-1.5 py-0.5 rounded text-xs font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className="flex gap-3 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div
        className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold ${
          isUser
            ? "bg-gradient-to-br from-accent-purple to-accent-blue"
            : "bg-gradient-to-br from-accent-green to-accent-cyan"
        }`}
      >
        {isUser ? "U" : "S"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[13px] font-semibold">
            {isUser ? "You" : "Chat-Skills"}
          </span>
          <span className="text-[11px] text-text-muted">
            {formatTime(message.timestamp)}
          </span>
        </div>

        <div className="text-sm leading-relaxed text-text-secondary prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:text-text-primary prose-strong:text-text-primary prose-a:text-accent-blue">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {message.skillInvocations?.map((invocation) => (
          <SkillInvokeCard key={invocation.id} invocation={invocation} />
        ))}
      </div>
    </div>
  );
}
