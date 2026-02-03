"use client";

import type { DepsData } from "@/types";
import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  installed: {
    icon: <Check className="w-3.5 h-3.5" />,
    iconBg: "bg-accent-green-dim text-accent-green",
    bar: "w-full bg-accent-green",
    label: "text-accent-green",
  },
  installing: {
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    iconBg: "bg-accent-blue-dim text-accent-blue",
    bar: "w-2/3 bg-accent-blue animate-pulse",
    label: "text-accent-blue",
  },
  pending: {
    icon: <Circle className="w-3.5 h-3.5" />,
    iconBg: "bg-white/5 text-text-muted",
    bar: "w-0",
    label: "text-text-muted",
  },
  error: {
    icon: <Circle className="w-3.5 h-3.5" />,
    iconBg: "bg-accent-red-dim text-accent-red",
    bar: "w-full bg-accent-red",
    label: "text-accent-red",
  },
};

export function DepsPanel({ data }: { data: DepsData }) {
  return (
    <div className="p-3.5">
      <div className="text-xs font-semibold text-text-secondary mb-2.5 flex items-center gap-1.5">
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        </svg>
        {data.manager} install ({data.packages.length} packages)
      </div>

      <div className="flex flex-col gap-2">
        {data.packages.map((pkg) => {
          const s = STATUS_STYLES[pkg.status];
          return (
            <div
              key={pkg.name}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-border-glass"
            >
              <div
                className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
                  s.iconBg
                )}
              >
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs font-medium text-text-primary">
                  {pkg.name}
                </div>
                <div className="font-mono text-[11px] text-text-muted">
                  {pkg.version}
                </div>
              </div>
              <div className="w-20 h-[3px] rounded-sm bg-white/[0.06] overflow-hidden">
                <div className={cn("h-full rounded-sm transition-all duration-500", s.bar)} />
              </div>
              <span className={cn("text-[11px] font-mono shrink-0", s.label)}>
                {pkg.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
