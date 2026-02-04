export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  activities?: ActivityItem[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  skillInvocations?: SkillInvocation[]
  isAutomatic?: boolean
}

export interface SkillInvocation {
  id: string
  skillName: string
  type: 'script' | 'deps' | 'files' | 'reference' | 'subagent'
  status: 'running' | 'success' | 'error'
  data: TerminalData | DepsData | FilesData | ReferenceData | SubagentData
  scriptPath?: string
  command?: string
  args?: string[]
  reference?: string
  stdin?: string
  timeout?: number
  subagentPrompt?: string
  subagentImages?: string[]
}

export interface TerminalData {
  command: string
  cwd?: string
  lines: TerminalLine[]
  exitCode?: number
  duration?: number
}

export interface TerminalLine {
  type: 'prompt' | 'cmd' | 'output' | 'success' | 'error' | 'info' | 'warn'
  text: string
}

export interface DepsData {
  manager: string
  packages: DepPackage[]
}

export interface DepPackage {
  name: string
  version: string
  status: 'installed' | 'installing' | 'pending' | 'error'
  progress: number
}

export interface FilesData {
  files: FileNode[]
  diffs?: FileDiff[]
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  depth: number
  tag?: 'new' | 'modified' | 'deleted'
  icon?: 'ts' | 'tsx' | 'css' | 'json' | 'folder' | 'md' | 'py' | 'js'
}

export interface ReferenceData {
  filename: string
  content?: string
}

export interface SubagentData {
  prompt: string
  images: string[]
  result?: string
}

export interface FileDiff {
  filePath: string
  additions: number
  deletions: number
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  lineNum: number
  content: string
}

export interface Skill {
  name: string
  description: string
  tags?: string[]
  version?: string
  hasScripts: boolean
  hasRules: boolean
  hasData: boolean
  scripts?: string[]
  rules?: string[]
  path: string
  content?: string
}

export interface Settings {
  openaiApiKey: string
  openaiBaseUrl: string
  model: string
  skillsDir: string
}

export interface ActivityItem {
  id: string
  type: 'skill' | 'script' | 'deps' | 'files' | 'chat'
  color: 'green' | 'blue' | 'amber' | 'purple' | 'red'
  text: string
  time: string
  status?: 'running' | 'done'
}

export const DEFAULT_SETTINGS: Settings = {
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  skillsDir: '~/.claude/skills',
}
