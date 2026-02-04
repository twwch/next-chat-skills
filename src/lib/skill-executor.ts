import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// Cache the global npm modules path so we only run `npm root -g` once.
let _globalNodeModules: string | null = null;
function getGlobalNodeModules(): string {
  if (_globalNodeModules === null) {
    try {
      _globalNodeModules = execSync("npm root -g", { encoding: "utf-8" }).trim();
    } catch {
      _globalNodeModules = "";
    }
  }
  return _globalNodeModules;
}

// Build NODE_PATH that includes the global npm modules directory.
function buildNodePath(): string {
  const globalRoot = getGlobalNodeModules();
  const existing = process.env.NODE_PATH || "";
  if (!globalRoot) return existing;
  return existing ? `${existing}${path.delimiter}${globalRoot}` : globalRoot;
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Strip ANSI escape codes (colors, cursor movement, screen clear, etc.)
// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

// Spinner characters used by CLI tools (ora, clack, etc.)
// eslint-disable-next-line no-control-regex
const SPINNER_RE = /^[◒◐◓◑◴◷◶◵⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●◕◔◑⣾⣽⣻⢿⡿⣟⣯⣷⠁⠂⠄⡀⢀⠠⠐⠈⣀⣤⣶⣿⠿⠟⠛⠉⠀⠿⠻⠽⠾┌│├└◇◆─╮╰╯┐┘┤┼▪▸▹►▻⬤○◎]\s*/;

// Normalize a line for deduplication: strip spinner chars + trailing dots
function normalizeForDedup(line: string): string {
  return line.replace(SPINNER_RE, "").replace(/\.+$/, "").trim();
}

// Process raw output: strip ANSI, handle \r, split into clean lines.
function cleanLines(data: Buffer): string[] {
  const stripped = stripAnsi(data.toString());
  const results: string[] = [];
  for (const line of stripped.split("\n")) {
    // \r means "return to start of line" — only keep the last segment
    const segments = line.split("\r");
    const final = segments[segments.length - 1].trim();
    if (final.length === 0) continue;
    results.push(final);
  }
  return results;
}

// Creates a stateful line emitter that deduplicates consecutive spinner lines.
// Lines like "◒ Cloning repository.." and "◑ Cloning repository..." are
// treated as the same line — only the first occurrence is emitted.
function createDeduplicatedEmitter(
  onEvent: (event: ExecutionEvent) => void
): (line: string, lineType: string) => void {
  let lastNormalized = "";

  return (line: string, lineType: string) => {
    const normalized = normalizeForDedup(line);
    if (normalized === lastNormalized && normalized.length > 0) {
      return; // skip duplicate spinner line
    }
    lastNormalized = normalized;
    onEvent({ type: "line", line: { type: lineType, text: line } });
  };
}

export interface ExecutionEvent {
  type: "line" | "exit";
  line?: { type: string; text: string };
  code?: number;
}

export function executeSkillScript(
  skillPath: string,
  scriptPath: string,
  args: string[],
  onEvent: (event: ExecutionEvent) => void,
  onDone: () => void,
  options?: { stdin?: string; timeout?: number }
): () => void {
  const resolvedSkillPath = expandHome(skillPath);
  const fullScriptPath = path.join(resolvedSkillPath, scriptPath);

  if (!fs.existsSync(fullScriptPath)) {
    onEvent({
      type: "line",
      line: { type: "error", text: `Script not found: ${scriptPath}` },
    });
    onEvent({ type: "exit", code: 1 });
    onDone();
    return () => {};
  }

  const ext = path.extname(fullScriptPath);
  let cmd: string;
  let cmdArgs: string[];

  if (ext === ".py") {
    cmd = "python3";
    cmdArgs = [fullScriptPath, ...args];
  } else if (ext === ".js" || ext === ".mjs") {
    cmd = "node";
    cmdArgs = [fullScriptPath, ...args];
  } else if (ext === ".sh") {
    cmd = "bash";
    cmdArgs = [fullScriptPath, ...args];
  } else {
    cmd = fullScriptPath;
    cmdArgs = args;
  }

  onEvent({
    type: "line",
    line: { type: "cmd", text: `$ ${cmd} ${cmdArgs.join(" ")}` },
  });

  const child = spawn(cmd, cmdArgs, {
    cwd: resolvedSkillPath,
    env: { ...process.env, NODE_PATH: buildNodePath() },
    shell: false,
  });

  // Write stdin data if provided, then close; otherwise close immediately
  // to prevent scripts that read stdin from hanging forever.
  if (options?.stdin) {
    child.stdin.write(options.stdin);
  }
  child.stdin.end();

  // Timeout: kill the process if it exceeds the limit (default 60s)
  const timeoutMs = (options?.timeout ?? 60) * 1000;
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    onEvent({
      type: "line",
      line: { type: "error", text: `Script timed out after ${options?.timeout ?? 60}s` },
    });
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }, timeoutMs);

  const emitStdout = createDeduplicatedEmitter(onEvent);
  const emitStderr = createDeduplicatedEmitter(onEvent);

  child.stdout.on("data", (data: Buffer) => {
    for (const line of cleanLines(data)) {
      emitStdout(line, inferLineType(line));
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    for (const line of cleanLines(data)) {
      emitStderr(line, "warn");
    }
  });

  child.on("close", (code) => {
    clearTimeout(timer);
    onEvent({ type: "exit", code: killed ? 124 : (code ?? 0) });
    onDone();
  });

  child.on("error", (err) => {
    clearTimeout(timer);
    onEvent({
      type: "line",
      line: { type: "error", text: `Process error: ${err.message}` },
    });
    onEvent({ type: "exit", code: 1 });
    onDone();
  });

  return () => {
    clearTimeout(timer);
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  };
}

// Normalize "skills add" commands for non-interactive execution:
// - Add -g to install globally (skip global/local prompt)
// - Add --yes to skip confirmation prompts
// Result: npx skills add -g --yes <repo>
function normalizeCommand(command: string): string {
  if (/\bskills\s+add\b/.test(command)) {
    const hasG = /(^|\s)(-g|--global)(\s|$)/.test(command);
    const hasYes = /(^|\s)--yes(\s|$)/.test(command);
    if (!hasG || !hasYes) {
      const flags: string[] = [];
      if (!hasG) flags.push("-g");
      if (!hasYes) flags.push("--yes");
      command = command.replace(/\bskills\s+add\b/, `skills add ${flags.join(" ")}`);
    }
  }
  return command;
}

export function executeShellCommand(
  command: string,
  cwd: string,
  onEvent: (event: ExecutionEvent) => void,
  onDone: () => void
): () => void {
  command = normalizeCommand(command);

  onEvent({
    type: "line",
    line: { type: "cmd", text: `$ ${command}` },
  });

  const child = spawn(command, {
    cwd,
    env: { ...process.env, NODE_PATH: buildNodePath() },
    shell: true,
  });

  const emitStdout = createDeduplicatedEmitter(onEvent);
  const emitStderr = createDeduplicatedEmitter(onEvent);

  child.stdout.on("data", (data: Buffer) => {
    for (const line of cleanLines(data)) {
      emitStdout(line, inferLineType(line));
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    for (const line of cleanLines(data)) {
      emitStderr(line, "warn");
    }
  });

  child.on("close", (code) => {
    onEvent({ type: "exit", code: code ?? 0 });
    onDone();
  });

  child.on("error", (err) => {
    onEvent({
      type: "line",
      line: { type: "error", text: `Process error: ${err.message}` },
    });
    onEvent({ type: "exit", code: 1 });
    onDone();
  });

  return () => {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  };
}

function inferLineType(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("✔") || trimmed.startsWith("✓") || trimmed.startsWith("Success"))
    return "success";
  if (trimmed.startsWith("✗") || trimmed.startsWith("Error") || trimmed.startsWith("error"))
    return "error";
  if (trimmed.startsWith("info") || trimmed.startsWith("⟳"))
    return "info";
  if (trimmed.startsWith("warn") || trimmed.startsWith("⚠"))
    return "warn";
  return "output";
}
