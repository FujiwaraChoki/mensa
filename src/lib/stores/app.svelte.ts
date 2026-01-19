// mensa - App State Management (Svelte 5 Runes)

import { browser } from '$app/environment';
import type { AppState, AppConfig, Message, ToolExecution, WorkspaceConfig, ClaudeConfig, MCPServerConfig, PermissionMode, Attachment, MessageBlock, SubagentGroup, SettingSource, SlashCommand, Theme } from '$lib/types';

const DEFAULT_CLAUDE_CONFIG: ClaudeConfig = {
  permissionMode: 'acceptEdits',
  maxTurns: 25,
  mcpServers: [],
  skills: {
    enabled: true,
    settingSources: ['user', 'project']
  },
  vimMode: false
};

// App configuration persisted to localStorage
function createAppConfig() {
  // Always start with defaults - will hydrate from localStorage on client
  let onboardingCompleted = $state(false);
  let workspace = $state<WorkspaceConfig | undefined>(undefined);
  let claude = $state<ClaudeConfig>({ ...DEFAULT_CLAUDE_CONFIG });
  let theme = $state<Theme>('system');
  let themeUserSet = $state(false); // True once user has manually changed theme
  let _initialized = $state(false);

  // Load from localStorage (call this from client-side code)
  function hydrate() {
    if (!browser || _initialized) return;

    const stored = localStorage.getItem('mensa-config');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        onboardingCompleted = data.onboardingCompleted ?? false;
        workspace = data.workspace ?? undefined;
        claude = { ...DEFAULT_CLAUDE_CONFIG, ...data.claude };
        theme = data.theme ?? 'system';
        themeUserSet = data.themeUserSet ?? false;
        console.log('[mensa] Hydrated config from localStorage:', { onboardingCompleted, workspace, claude, theme, themeUserSet });
      } catch (e) {
        console.error('[mensa] Failed to parse stored config:', e);
      }
    }
    _initialized = true;
  }

  function save() {
    if (!browser) return;
    const data = { onboardingCompleted, workspace, claude, theme, themeUserSet };
    localStorage.setItem('mensa-config', JSON.stringify(data));
    console.log('[mensa] Saved config to localStorage:', data);
  }

  // Auto-hydrate on client
  if (browser) {
    hydrate();
  }

  return {
    get workspace() { return workspace; },
    get onboardingCompleted() { return onboardingCompleted; },
    get initialized() { return _initialized; },
    get claude() { return claude; },
    get theme() { return theme; },
    get themeUserSet() { return themeUserSet; },

    hydrate,

    setWorkspace(ws: WorkspaceConfig) {
      workspace = ws;
      save();
    },

    completeOnboarding() {
      onboardingCompleted = true;
      save();
    },

    setTheme(newTheme: Theme) {
      theme = newTheme;
      themeUserSet = true;
      save();
    },

    // Claude config methods
    setPermissionMode(mode: PermissionMode) {
      claude = { ...claude, permissionMode: mode };
      save();
    },

    setMaxTurns(turns: number) {
      claude = { ...claude, maxTurns: turns };
      save();
    },

    addMCPServer(server: MCPServerConfig) {
      claude = { ...claude, mcpServers: [...claude.mcpServers, server] };
      save();
    },

    updateMCPServer(id: string, updates: Partial<MCPServerConfig>) {
      claude = {
        ...claude,
        mcpServers: claude.mcpServers.map(s => s.id === id ? { ...s, ...updates } : s)
      };
      save();
    },

    removeMCPServer(id: string) {
      claude = { ...claude, mcpServers: claude.mcpServers.filter(s => s.id !== id) };
      save();
    },

    // Skills config methods
    setSkillsEnabled(enabled: boolean) {
      claude = { ...claude, skills: { ...claude.skills, enabled } };
      save();
    },

    setSkillsSettingSources(sources: SettingSource[]) {
      claude = { ...claude, skills: { ...claude.skills, settingSources: sources } };
      save();
    },

    setVimMode(enabled: boolean) {
      claude = { ...claude, vimMode: enabled };
      save();
    },

    reset() {
      onboardingCompleted = false;
      workspace = undefined;
      claude = { ...DEFAULT_CLAUDE_CONFIG };
      theme = 'system';
      themeUserSet = false;
      if (browser) {
        localStorage.removeItem('mensa-config');
        console.log('[mensa] Config reset');
      }
    }
  };
}

// Current app state
function createAppState() {
  let state = $state<AppState>('onboarding');

  return {
    get current() { return state; },
    set current(value: AppState) { state = value; }
  };
}

// Chat messages
function createMessages() {
  let messages = $state<Message[]>([]);
  let blockSeq = 0;

  return {
    get all() { return messages; },
    get count() { return messages.length; },

    add(message: Omit<Message, 'id' | 'timestamp'> & { timestamp?: Date; attachments?: Attachment[] }) {
      messages = [...messages, {
        ...message,
        id: crypto.randomUUID(),
        timestamp: message.timestamp ?? new Date(),
        attachments: message.attachments
      }];
    },

    updateLast(content: string) {
      if (messages.length > 0) {
        const last = messages[messages.length - 1];
        messages = [...messages.slice(0, -1), { ...last, content }];
      }
    },

    appendTextToLast(text: string, order?: number) {
      if (messages.length === 0) return;
      const last = messages[messages.length - 1];
      const blocks: MessageBlock[] = last.blocks ? [...last.blocks] : [];
      const nextOrder = order ?? ++blockSeq;
      const lastBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;

      if (lastBlock && lastBlock.type === 'text' && order === undefined) {
        // Merge with previous text block when no explicit order given
        blocks[blocks.length - 1] = {
          type: 'text',
          content: lastBlock.content + text,
          order: lastBlock.order
        };
      } else {
        // Create new text block with explicit order
        const textBlock = { type: 'text' as const, content: text, order: nextOrder };
        blocks.push(textBlock);
        console.log('[messages] Added text block with order:', nextOrder);
      }

      messages = [...messages.slice(0, -1), {
        ...last,
        content: last.content + text,
        blocks
      }];
    },

    addToolToLast(tool: Omit<ToolExecution, 'id' | 'startedAt'>, addBlock = true, order?: number, parentSubagentId?: string) {
      console.log('[messages] addToolToLast called:', tool.tool, 'addBlock:', addBlock, 'order:', order, 'parentSubagentId:', parentSubagentId);
      if (messages.length > 0) {
        const last = messages[messages.length - 1];
        console.log('[messages] Last message:', last.id, 'current tools:', last.tools?.length ?? 0, 'current blocks:', last.blocks?.length ?? 0);
        const newTool: ToolExecution = {
          ...tool,
          id: crypto.randomUUID(),
          startedAt: new Date(),
          parentSubagentId
        };
        const blocks: MessageBlock[] = last.blocks ? [...last.blocks] : [];
        if (addBlock) {
          const nextOrder = order ?? ++blockSeq;
          const toolBlock = { type: 'tool' as const, toolId: newTool.id, order: nextOrder };
          blocks.push(toolBlock);
          console.log('[messages] Added tool block:', toolBlock);
        }
        messages = [...messages.slice(0, -1), {
          ...last,
          tools: [...(last.tools || []), newTool],
          blocks
        }];
        console.log('[messages] After update - tools:', messages[messages.length - 1].tools?.length, 'blocks:', messages[messages.length - 1].blocks?.length);
        return newTool.id;
      } else {
        console.log('[messages] WARNING: No messages to add tool to!');
      }
      return null;
    },

    updateTool(messageId: string, toolId: string, updates: Partial<ToolExecution>) {
      messages = messages.map(msg => {
        if (msg.id === messageId && msg.tools) {
          return {
            ...msg,
            tools: msg.tools.map(t =>
              t.id === toolId ? { ...t, ...updates } : t
            )
          };
        }
        return msg;
      });
    },

    clear() {
      messages = [];
    }
  };
}

// Tool executions (for the activity panel)
function createToolActivity() {
  let tools = $state<ToolExecution[]>([]);

  return {
    get all() { return tools; },
    get running() { return tools.filter(t => t.status === 'running'); },
    get recent() { return tools.slice(-20); },

    add(tool: Omit<ToolExecution, 'id' | 'startedAt'>) {
      console.log('[toolActivity] ADD called:', tool);
      const newTool: ToolExecution = {
        ...tool,
        id: crypto.randomUUID(),
        startedAt: new Date()
      };
      tools = [...tools, newTool];
      console.log('[toolActivity] Tools now:', tools.length);
      return newTool.id;
    },

    update(id: string, updates: Partial<ToolExecution>) {
      tools = tools.map(t =>
        t.id === id ? { ...t, ...updates } : t
      );
    },

    complete(id: string, output?: string) {
      tools = tools.map(t =>
        t.id === id
          ? { ...t, status: 'completed' as const, output, completedAt: new Date() }
          : t
      );
    },

    error(id: string, output?: string) {
      tools = tools.map(t =>
        t.id === id
          ? { ...t, status: 'error' as const, output, completedAt: new Date() }
          : t
      );
    },

    clear() {
      tools = [];
    }
  };
}

// UI state
function createUIState() {
  let showToolPanel = $state(false);  // Hidden by default, accessible via ⌘B
  let isStreaming = $state(false);

  return {
    get showToolPanel() { return showToolPanel; },
    set showToolPanel(value: boolean) { showToolPanel = value; },

    get isStreaming() { return isStreaming; },
    set isStreaming(value: boolean) { isStreaming = value; },

    toggleToolPanel() {
      showToolPanel = !showToolPanel;
    }
  };
}

// Pending attachments for new messages
const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function createPendingAttachments() {
  let attachments = $state<Attachment[]>([]);

  return {
    get all() { return attachments; },
    get count() { return attachments.length; },
    get totalSize() { return attachments.reduce((sum, a) => sum + a.size, 0); },
    get canAdd() { return attachments.length < MAX_ATTACHMENTS; },
    get maxAttachments() { return MAX_ATTACHMENTS; },
    get maxFileSize() { return MAX_FILE_SIZE; },

    add(attachment: Attachment) {
      if (attachments.length >= MAX_ATTACHMENTS) {
        console.warn('[pendingAttachments] Max attachments reached');
        return false;
      }
      if (attachment.size > MAX_FILE_SIZE) {
        console.warn('[pendingAttachments] File too large:', attachment.size);
        return false;
      }
      attachments = [...attachments, attachment];
      return true;
    },

    remove(id: string) {
      const attachment = attachments.find(a => a.id === id);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      attachments = attachments.filter(a => a.id !== id);
    },

    clear(revokeUrls = false) {
      // Only revoke blob URLs if explicitly requested
      // (URLs are kept when attachments are moved to messages)
      if (revokeUrls) {
        for (const attachment of attachments) {
          if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        }
      }
      attachments = [];
    }
  };
}

// Subagent groups for collapsible tool display
function createSubagentGroups() {
  let groups = $state<SubagentGroup[]>([]);
  let activeSubagentId = $state<string | null>(null);

  return {
    get all() { return groups; },
    get active() { return activeSubagentId; },

    startSubagent(taskToolId: string, description: string, subagentType: string): string {
      const id = crypto.randomUUID();
      const group: SubagentGroup = {
        id,
        taskToolId,
        description,
        subagentType,
        status: 'running',
        childToolIds: [],
        startedAt: new Date()
      };
      groups = [...groups, group];
      activeSubagentId = id;
      console.log('[subagentGroups] Started subagent:', id, description, subagentType);
      return id;
    },

    addChildTool(toolId: string): void {
      if (!activeSubagentId) return;
      groups = groups.map(g =>
        g.id === activeSubagentId
          ? { ...g, childToolIds: [...g.childToolIds, toolId] }
          : g
      );
      console.log('[subagentGroups] Added child tool:', toolId, 'to subagent:', activeSubagentId);
    },

    completeSubagent(taskToolId: string, status: 'completed' | 'error' = 'completed'): void {
      groups = groups.map(g =>
        g.taskToolId === taskToolId
          ? { ...g, status, completedAt: new Date() }
          : g
      );
      // Clear active if this was the active subagent
      const completedGroup = groups.find(g => g.taskToolId === taskToolId);
      if (completedGroup && activeSubagentId === completedGroup.id) {
        activeSubagentId = null;
      }
      console.log('[subagentGroups] Completed subagent for task:', taskToolId);
    },

    getGroup(id: string): SubagentGroup | undefined {
      return groups.find(g => g.id === id);
    },

    getGroupByTaskToolId(taskToolId: string): SubagentGroup | undefined {
      return groups.find(g => g.taskToolId === taskToolId);
    },

    clear() {
      groups = [];
      activeSubagentId = null;
    }
  };
}

// Slash commands available from skills
function createSlashCommands() {
  let commands = $state<SlashCommand[]>([]);

  return {
    get all() { return commands; },
    get count() { return commands.length; },

    set(newCommands: SlashCommand[]) {
      commands = newCommands;
      console.log('[slashCommands] Set', commands.length, 'commands');
    },

    add(command: SlashCommand) {
      // Avoid duplicates
      if (!commands.some(c => c.name === command.name)) {
        commands = [...commands, command];
      }
    },

    clear() {
      commands = [];
    }
  };
}

// Export singleton instances
export const appConfig = createAppConfig();
export const appState = createAppState();
export const messages = createMessages();
export const toolActivity = createToolActivity();
export const uiState = createUIState();
export const pendingAttachments = createPendingAttachments();
export const subagentGroups = createSubagentGroups();
export const slashCommands = createSlashCommands();
