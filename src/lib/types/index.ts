// mensa - Type definitions

export type AppState = 'onboarding' | 'chat';

export type Theme = 'light' | 'dark' | 'system';

export type OnboardingStep = 'welcome' | 'workspace' | 'ready';

// Attachment types
export type AttachmentType = 'image' | 'document';

export interface Attachment {
  id: string;
  type: AttachmentType;
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64 encoded
  previewUrl?: string; // blob URL for preview
}

// Claude SDK content block types
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    data: string;
  };
}

export interface DocumentContentBlock {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf' | 'text/plain';
    data: string;
  };
}

export type ContentBlock = TextContentBlock | ImageContentBlock | DocumentContentBlock;

export type MessageBlock =
  | { type: 'text'; content: string; order: number }
  | { type: 'tool'; toolId: string; order: number }
  | { type: 'image'; mediaType: string; data: string; order: number };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tools?: ToolExecution[];
  blocks?: MessageBlock[];
  attachments?: Attachment[];
}

export interface ToolExecution {
  id: string;
  tool: ToolName;
  toolUseId?: string;
  status: 'running' | 'completed' | 'error';
  input?: string;
  output?: string;
  startedAt: Date;
  completedAt?: Date;
  parentSubagentId?: string;  // If this tool belongs to a subagent
}

export interface SubagentGroup {
  id: string;
  taskToolId: string;        // The parent Task tool's ID
  description: string;       // From Task input (e.g., "Explore codebase")
  subagentType: string;      // e.g., "Explore", "Plan"
  status: 'running' | 'completed' | 'error';
  childToolIds: string[];    // IDs of tools executed by this subagent
  startedAt: Date;
  completedAt?: Date;
}

export type ToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Glob'
  | 'Grep'
  | 'WebSearch'
  | 'WebFetch'
  | 'Task'
  | 'TodoWrite'
  | 'Skill'
  | (string & {}); // Allow any string for unknown tools

export interface WorkspaceConfig {
  path: string;
  name: string;
  lastOpened?: Date;
}

// MCP Server Configuration
export interface MCPServerConfig {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  enabled: boolean;
  // For stdio servers
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // For SSE servers
  url?: string;
  headers?: Record<string, string>;
}

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

// Skills configuration
export type SettingSource = 'user' | 'project';

export interface SkillsConfig {
  enabled: boolean;
  settingSources: SettingSource[];
}

export interface SlashCommand {
  name: string;
  description?: string;
  source: SettingSource;
}

export interface ClaudeConfig {
  permissionMode: PermissionMode;
  maxTurns: number;
  mcpServers: MCPServerConfig[];
  skills: SkillsConfig;
  vimMode: boolean;
}

export interface AppConfig {
  workspace?: WorkspaceConfig;
  onboardingCompleted: boolean;
  claude?: ClaudeConfig;
}

// @ Mention types
export type MentionType = 'file' | 'skill';

export interface MentionItem {
  type: MentionType;
  value: string;        // path for files, name for skills
  displayName: string;  // shown in UI
  isDirectory?: boolean; // for file navigation
}

// Plan mode types
export interface QuestionOption {
  label: string;
  description: string;
}

export interface PlanModeQuestion {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AllowedPrompt {
  tool: string;
  prompt: string;
}

// Re-export session types from the store for convenience
export type { SessionStatus, SessionState } from '$lib/stores/sessions.svelte';

// Re-export git types
export * from './git';

// Re-export review types
export * from './review';
