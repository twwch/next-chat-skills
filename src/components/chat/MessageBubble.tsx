"use client";

import { useState, useMemo } from "react";
import type { FileBlockData, Message } from "@/types";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { SkillInvokeCard } from "@/components/skill-cards/SkillInvokeCard";
import { Code2, FileCode, FileText, FileJson, Braces, Eye, Download } from "lucide-react";

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

// Extract base language from className, stripping optional `:filename` suffix
// e.g. "language-html:index.html" → "html"
function parseLang(className?: string): string | null {
  if (!className) return null;
  const match = /language-(\S+)/.exec(className);
  if (!match) return null;
  return match[1].toLowerCase().split(":")[0];
}

// Check if the code block is a file block (has `:filename` embedded in the language tag)
function isFileBlock(className?: string): boolean {
  if (!className) return false;
  const match = /language-(\S+)/.exec(className);
  return !!match && match[1].includes(":");
}

function getLangInfo(className?: string) {
  const lang = parseLang(className);
  if (!lang) return null;
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
  if (node && typeof node === "object" && "props" in node) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return extractTextContent((node as any).props.children);
  }
  return "";
}

const LANG_EXT: Record<string, string> = {
  html: "html", htm: "html", css: "css",
  javascript: "js", js: "js", typescript: "ts", ts: "ts",
  jsx: "jsx", tsx: "tsx", python: "py", py: "py",
  json: "json", bash: "sh", sh: "sh", markdown: "md", md: "md",
  yaml: "yml", yml: "yml", sql: "sql", xml: "xml", vue: "vue", svelte: "svelte",
};

// Extract filename from className
// Supports "language-html:index.html" → "index.html"
// Falls back to "download.{ext}" if no filename embedded
function getFilename(className?: string): string {
  if (!className) return "download.txt";
  const match = /language-(\S+)/.exec(className);
  if (!match) return "download.txt";
  const raw = match[1].toLowerCase();
  // lang:filename format (e.g. html:index.html)
  const colonIdx = raw.indexOf(":");
  if (colonIdx !== -1) {
    return raw.slice(colonIdx + 1) || "download.txt";
  }
  const ext = LANG_EXT[raw] || raw;
  return `download.${ext}`;
}

function downloadContent(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function HtmlCodeBlock({
  children,
  langInfo,
  filename,
  showDownload,
}: {
  children: React.ReactNode;
  langInfo: { label: string; icon: React.ReactNode };
  filename: string;
  showDownload: boolean;
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
        <div className="ml-auto flex items-center gap-1.5">
          {showDownload && (
            <button
              onClick={() => downloadContent(rawHtml, filename)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer bg-white/5 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 border border-transparent"
              title={`Download ${filename}`}
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          )}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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

// Marker used by parseFileBlocks in page.tsx
const FILE_BLOCK_MARKER = "\u00A7FILE_BLOCK\u00A7";
const FILE_BLOCK_SPLIT_RE = /\u00A7FILE_BLOCK\u00A7(\d+)\u00A7FILE_BLOCK\u00A7/;

// For backward compatibility: extract ````file: blocks from old stored messages
// Backreference ensures opening and closing use the same number of backticks (4+)
const LEGACY_FILE_BLOCK_RE = /(`{4,})file:([^\n]+)\n([\s\S]*?)\1/g;
const FILE_LANG_MAP: Record<string, string> = {
  html: "html", htm: "html", css: "css", js: "javascript",
  ts: "typescript", jsx: "jsx", tsx: "tsx", py: "python",
  json: "json", md: "markdown", sh: "bash", yaml: "yaml", yml: "yaml",
};

function extractFileBlocksFromContent(content: string): {
  processedContent: string;
  fileBlocks: FileBlockData[];
} {
  const fileBlocks: FileBlockData[] = [];
  let blockIndex = 0;
  const processedContent = content.replace(
    LEGACY_FILE_BLOCK_RE,
    (_match, _backticks: string, filePath: string, fileContent: string) => {
      const trimmedPath = filePath.trim();
      const ext = trimmedPath.split(".").pop() || "";
      const lang = FILE_LANG_MAP[ext] || ext;
      const filename = trimmedPath.split("/").pop() || "";
      fileBlocks.push({ filePath: trimmedPath, content: fileContent, lang, filename });
      const marker = `${FILE_BLOCK_MARKER}${blockIndex}${FILE_BLOCK_MARKER}`;
      blockIndex++;
      return marker;
    }
  );
  return { processedContent, fileBlocks };
}

function FileBlockCard({ block }: { block: FileBlockData }) {
  const [showPreview, setShowPreview] = useState(false);
  const langInfo =
    LANG_DISPLAY[block.lang] || {
      label: block.lang.toUpperCase(),
      icon: <Code2 className="w-4 h-4" />,
    };
  const isHtml = block.lang === "html" || block.lang === "htm";

  return (
    <div className="not-prose my-3">
      {/* File saved indicator */}
      <div className="my-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-green-dim text-accent-green text-xs font-medium">
        <p className="m-0"><strong>File saved:</strong> <code className="text-accent-green bg-accent-green/10 text-[11px] px-1 py-0.5 rounded">{block.filePath}</code></p>
      </div>
      {/* Code card */}
      <div className="border border-border-glass rounded-2xl bg-bg-card overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border-glass bg-bg-glass">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-blue-dim text-accent-blue">
            {langInfo.icon}
          </div>
          <span className="font-heading text-[13px] font-semibold text-text-primary">
            {langInfo.label}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => downloadContent(block.content, block.filename)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer bg-white/5 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 border border-transparent"
              title={`Download ${block.filename}`}
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            {isHtml && (
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  showPreview
                    ? "bg-accent-green/20 text-accent-green border border-accent-green/30"
                    : "bg-white/5 text-text-secondary hover:text-accent-green hover:bg-accent-green/10 border border-transparent"
                }`}
              >
                {showPreview ? <Code2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPreview ? "Code" : "Preview"}
              </button>
            )}
          </div>
        </div>
        {isHtml && showPreview ? (
          <div className="bg-white overflow-hidden">
            <iframe
              srcDoc={block.content}
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
              <code className="text-text-primary">{block.content}</code>
            </pre>
            <div className="px-3.5 py-1.5 bg-white/[0.03] border-t border-white/5" />
          </div>
        )}
      </div>
    </div>
  );
}

const markdownComponents: Components = {
  blockquote: ({ children }) => {
    const text = extractTextContent(children);
    if (text.includes("File saved:")) {
      return (
        <div className="not-prose my-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-green-dim text-accent-green text-xs font-medium [&_p]:m-0 [&_strong]:text-accent-green [&_code]:text-accent-green [&_code]:bg-accent-green/10 [&_code]:text-[11px]">
          {children}
        </div>
      );
    }
    return (
      <blockquote className="not-prose my-2 pl-3 border-l-2 border-border-glass text-text-muted text-sm italic [&_p]:my-1">
        {children}
      </blockquote>
    );
  },
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
  p: ({ children }) => (
    <p className="whitespace-pre-line">{children}</p>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const langInfo = getLangInfo(className);
    if (langInfo) {
      // HTML code blocks get a preview button
      const lang = parseLang(className) || "";
      const fname = getFilename(className);
      const hasFile = isFileBlock(className);
      if (lang === "html" || lang === "htm") {
        return (
          <HtmlCodeBlock langInfo={langInfo} filename={fname} showDownload={hasFile}>{children}</HtmlCodeBlock>
        );
      }
      const codeText = extractTextContent(children);
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
            {hasFile && (
              <button
                onClick={() => downloadContent(codeText, fname)}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer bg-white/5 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 border border-transparent"
                title={`Download ${fname}`}
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            )}
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
        className="not-prose text-accent-blue bg-bg-glass px-1.5 py-0.5 rounded text-xs font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  // Resolve file blocks: use pre-processed data if available, otherwise extract from legacy content
  const { content, fileBlocks } = useMemo(() => {
    // New messages: already have fileBlocks and markers
    if (message.fileBlocks && message.fileBlocks.length > 0 && message.content.includes(FILE_BLOCK_MARKER)) {
      return { content: message.content, fileBlocks: message.fileBlocks };
    }
    // Old messages: extract ````file: blocks at render time
    if (LEGACY_FILE_BLOCK_RE.test(message.content)) {
      // Reset lastIndex since we used .test()
      LEGACY_FILE_BLOCK_RE.lastIndex = 0;
      const { processedContent, fileBlocks } = extractFileBlocksFromContent(message.content);
      if (fileBlocks.length > 0) {
        return { content: processedContent, fileBlocks };
      }
    }
    return { content: message.content, fileBlocks: [] as FileBlockData[] };
  }, [message.content, message.fileBlocks]);

  const hasFileBlocks = fileBlocks.length > 0 && content.includes(FILE_BLOCK_MARKER);

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

        {/* Attachment indicators */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.attachments.map((att, i) =>
              att.type === "image" && att.dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={att.dataUrl}
                  alt={att.name}
                  className="w-32 h-32 rounded-lg object-cover border border-border-glass"
                />
              ) : (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-glass bg-bg-glass text-xs text-text-secondary"
                >
                  <FileText className="w-3.5 h-3.5 text-accent-blue" />
                  {att.name}
                </span>
              )
            )}
          </div>
        )}

        <div className="text-sm leading-relaxed text-text-secondary prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:text-text-primary prose-strong:text-text-primary prose-a:text-accent-blue">
          {hasFileBlocks ? (
            // Split content on file block markers, interleave markdown and FileBlockCards
            (() => {
              const parts = content.split(FILE_BLOCK_SPLIT_RE);
              // parts alternates: [text, index, text, index, text, ...]
              return parts.map((part, i) => {
                if (i % 2 === 1) {
                  // This is a file block index
                  const blockIdx = parseInt(part, 10);
                  const block = fileBlocks[blockIdx];
                  if (block) return <FileBlockCard key={`fb-${blockIdx}`} block={block} />;
                  return null;
                }
                // This is a text segment — render with ReactMarkdown
                if (!part.trim()) return null;
                return (
                  <ReactMarkdown
                    key={`md-${i}`}
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={markdownComponents}
                  >
                    {part}
                  </ReactMarkdown>
                );
              });
            })()
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>

        {message.skillInvocations?.map((invocation) => (
          <SkillInvokeCard key={invocation.id} invocation={invocation} />
        ))}
      </div>
    </div>
  );
}
