// mensa - Multi-Session State Management (Svelte 5 Runes)

import type { Message, ToolExecution, SubagentGroup, MessageBlock, Attachment, PlanModeQuestion, AllowedPrompt } from '$lib/types';
import type { QueryHandle } from '$lib/services/claude';

export type SessionStatus = 'idle' | 'streaming' | 'completed' | 'error' | 'cancelled';

export interface SessionState {
  id: string;                    // Query ID from backend
  claudeSessionId?: string;      // For resume functionality
  status: SessionStatus;
  title: string;                 // Derived from first prompt
  messages: Message[];
  tools: ToolExecution[];
  subagentGroups: SubagentGroup[];
  pendingTools: Map<string, string>;
  toolUseIdToName: Map<string, string>;
  error?: string;
  createdAt: Date;
  queryHandle?: QueryHandle;     // For cancellation
  // Plan mode fields
  planMode: boolean;                          // Whether session is in plan mode
  planFilePath?: string;                      // Path to current plan file
  planContent?: string;                       // Cached plan content
  planApprovalPending?: boolean;              // Waiting for user to approve plan
  planApprovedPermissions?: AllowedPrompt[];  // Permissions approved with plan
  pendingQuestion?: PlanModeQuestion;         // Question waiting for user answer
  pendingQuestionToolUseId?: string;          // Tool use ID for the pending question
}

function createSessionStore() {
  let sessions = $state<Map<string, SessionState>>(new Map());
  let activeSessionId = $state<string | null>(null);
  let blockSeq = $state(0);

  // Helper to generate unique IDs
  const generateId = () => crypto.randomUUID();

  // Helper to derive title from first message
  const deriveTitle = (content: string): string => {
    const maxLen = 40;
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length <= maxLen) return firstLine;
    return firstLine.substring(0, maxLen - 3) + '...';
  };

  return {
    get sessions() { return sessions; },
    get activeSessionId() { return activeSessionId; },
    get activeSession(): SessionState | undefined {
      return activeSessionId ? sessions.get(activeSessionId) : undefined;
    },
    get streamingSessions(): SessionState[] {
      return [...sessions.values()].filter(s => s.status === 'streaming');
    },
    get hasStreamingSessions(): boolean {
      return [...sessions.values()].some(s => s.status === 'streaming');
    },
    get sessionList(): SessionState[] {
      return [...sessions.values()].sort((a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime()
      );
    },

    // Get a session by ID
    getSession(id: string): SessionState | undefined {
      return sessions.get(id);
    },

    // Create a new session
    createSession(initialTitle?: string): string {
      const id = generateId();
      const session: SessionState = {
        id,
        status: 'idle',
        title: initialTitle || 'New conversation',
        messages: [],
        tools: [],
        subagentGroups: [],
        pendingTools: new Map(),
        toolUseIdToName: new Map(),
        createdAt: new Date(),
        planMode: false,
      };
      sessions = new Map(sessions).set(id, session);
      return id;
    },

    // Switch to a session
    switchToSession(id: string): void {
      if (sessions.has(id)) {
        activeSessionId = id;
      }
    },

    // Close a session (optionally cancel if streaming)
    async closeSession(id: string): Promise<void> {
      const session = sessions.get(id);
      if (!session) return;

      // Cancel if streaming
      if (session.status === 'streaming' && session.queryHandle) {
        await session.queryHandle.cancel();
      }

      // Remove session
      const newSessions = new Map(sessions);
      newSessions.delete(id);
      sessions = newSessions;

      // If this was the active session, switch to another
      if (activeSessionId === id) {
        const remaining = [...sessions.keys()];
        activeSessionId = remaining.length > 0 ? remaining[0] : null;
      }
    },

    // Cancel a streaming session
    async cancelSession(id: string): Promise<void> {
      const session = sessions.get(id);
      if (!session || session.status !== 'streaming') return;

      if (session.queryHandle) {
        await session.queryHandle.cancel();
      }

      this.setStatus(id, 'cancelled');
    },

    // Update session with query handle
    setQueryHandle(sessionId: string, handle: QueryHandle): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        queryHandle: handle,
      });
    },

    // Set Claude session ID for resume functionality
    setClaudeSessionId(sessionId: string, claudeSessionId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        claudeSessionId,
      });
    },

    // Set session status
    setStatus(sessionId: string, status: SessionStatus, error?: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        status,
        error: error ?? session.error,
      });
    },

    // Add message to session
    addMessage(sessionId: string, message: Omit<Message, 'id' | 'timestamp'> & { timestamp?: Date; attachments?: Attachment[] }): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      const newMessage: Message = {
        ...message,
        id: generateId(),
        timestamp: message.timestamp ?? new Date(),
        attachments: message.attachments,
      };

      // Update title from first user message
      const isFirstUserMessage = message.role === 'user' &&
        session.messages.filter(m => m.role === 'user').length === 0;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        messages: [...session.messages, newMessage],
        title: isFirstUserMessage && message.content
          ? deriveTitle(message.content)
          : session.title,
      });
    },

    // Update last message content
    updateLastMessage(sessionId: string, content: string): void {
      const session = sessions.get(sessionId);
      if (!session || session.messages.length === 0) return;

      const messages = [...session.messages];
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = { ...last, content };

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        messages,
      });
    },

    // Append text to last message
    appendTextToLast(sessionId: string, text: string, order?: number): void {
      const session = sessions.get(sessionId);
      if (!session || session.messages.length === 0) return;

      const messages = [...session.messages];
      const last = messages[messages.length - 1];
      const blocks: MessageBlock[] = last.blocks ? [...last.blocks] : [];
      const nextOrder = order ?? ++blockSeq;
      const lastBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;

      if (lastBlock && lastBlock.type === 'text' && order === undefined) {
        // Merge with previous text block
        blocks[blocks.length - 1] = {
          type: 'text',
          content: (lastBlock as { content: string }).content + text,
          order: lastBlock.order,
        };
      } else {
        blocks.push({ type: 'text', content: text, order: nextOrder });
      }

      messages[messages.length - 1] = {
        ...last,
        content: last.content + text,
        blocks,
      };

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        messages,
      });
    },

    // Add tool to last message
    addToolToLast(
      sessionId: string,
      tool: Omit<ToolExecution, 'id' | 'startedAt'>,
      addBlock = true,
      order?: number,
      parentSubagentId?: string
    ): string | null {
      const session = sessions.get(sessionId);
      if (!session || session.messages.length === 0) return null;

      const messages = [...session.messages];
      const last = messages[messages.length - 1];
      const newTool: ToolExecution = {
        ...tool,
        id: generateId(),
        startedAt: new Date(),
        parentSubagentId,
      };

      const blocks: MessageBlock[] = last.blocks ? [...last.blocks] : [];
      if (addBlock) {
        const nextOrder = order ?? ++blockSeq;
        blocks.push({ type: 'tool', toolId: newTool.id, order: nextOrder });
      }

      messages[messages.length - 1] = {
        ...last,
        tools: [...(last.tools || []), newTool],
        blocks,
      };

      // Also add to session's tool activity
      const tools = [...session.tools, newTool];

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        messages,
        tools,
      });

      return newTool.id;
    },

    // Update a tool in the session
    updateTool(sessionId: string, messageId: string, toolId: string, updates: Partial<ToolExecution>): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      const messages = session.messages.map(msg => {
        if (msg.id === messageId && msg.tools) {
          return {
            ...msg,
            tools: msg.tools.map(t =>
              t.id === toolId ? { ...t, ...updates } : t
            ),
          };
        }
        return msg;
      });

      // Also update in session tools
      const tools = session.tools.map(t =>
        t.id === toolId ? { ...t, ...updates } : t
      );

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        messages,
        tools,
      });
    },

    // Complete a tool by ID
    completeTool(sessionId: string, toolId: string, output?: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      const tools = session.tools.map(t =>
        t.id === toolId
          ? { ...t, status: 'completed' as const, output, completedAt: new Date() }
          : t
      );

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        tools,
      });
    },

    // Add pending tool mapping
    addPendingTool(sessionId: string, key: string, toolId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      const pendingTools = new Map(session.pendingTools);
      pendingTools.set(key, toolId);

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        pendingTools,
      });
    },

    // Get and remove pending tool
    popPendingTool(sessionId: string, key: string): string | undefined {
      const session = sessions.get(sessionId);
      if (!session) return undefined;

      const toolId = session.pendingTools.get(key);
      if (toolId) {
        const pendingTools = new Map(session.pendingTools);
        pendingTools.delete(key);

        sessions = new Map(sessions).set(sessionId, {
          ...session,
          pendingTools,
        });
      }

      return toolId;
    },

    // Clear all pending tools
    clearPendingTools(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        pendingTools: new Map(),
      });
    },

    // Subagent group management
    startSubagent(sessionId: string, taskToolId: string, description: string, subagentType: string): string | null {
      const session = sessions.get(sessionId);
      if (!session) return null;

      const id = generateId();
      const group: SubagentGroup = {
        id,
        taskToolId,
        description,
        subagentType,
        status: 'running',
        childToolIds: [],
        startedAt: new Date(),
      };

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        subagentGroups: [...session.subagentGroups, group],
      });

      return id;
    },

    // Get active subagent for session
    getActiveSubagent(sessionId: string): SubagentGroup | undefined {
      const session = sessions.get(sessionId);
      if (!session) return undefined;
      return session.subagentGroups.find(g => g.status === 'running');
    },

    addChildToolToSubagent(sessionId: string, subagentId: string, toolId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      const subagentGroups = session.subagentGroups.map(g =>
        g.id === subagentId
          ? { ...g, childToolIds: [...g.childToolIds, toolId] }
          : g
      );

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        subagentGroups,
      });
    },

    completeSubagent(sessionId: string, taskToolId: string, status: 'completed' | 'error' = 'completed'): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      const subagentGroups = session.subagentGroups.map(g =>
        g.taskToolId === taskToolId
          ? { ...g, status, completedAt: new Date() }
          : g
      );

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        subagentGroups,
      });
    },

    getGroupByTaskToolId(sessionId: string, taskToolId: string): SubagentGroup | undefined {
      const session = sessions.get(sessionId);
      if (!session) return undefined;
      return session.subagentGroups.find(g => g.taskToolId === taskToolId);
    },

    // Clear all session data (for new thread)
    clearSession(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        messages: [],
        tools: [],
        subagentGroups: [],
        pendingTools: new Map(),
        toolUseIdToName: new Map(),
        status: 'idle',
        error: undefined,
        planMode: false,
        planFilePath: undefined,
        planContent: undefined,
        planApprovalPending: undefined,
        planApprovedPermissions: undefined,
        pendingQuestion: undefined,
        pendingQuestionToolUseId: undefined,
      });
    },

    // Plan mode management
    setPlanMode(sessionId: string, enabled: boolean): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        planMode: enabled,
        // Clear plan state when disabling plan mode
        ...(enabled ? {} : {
          planFilePath: undefined,
          planContent: undefined,
          planApprovalPending: undefined,
          planApprovedPermissions: undefined,
          pendingQuestion: undefined,
          pendingQuestionToolUseId: undefined,
        }),
      });
    },

    setPlanFile(sessionId: string, path: string, content: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        planFilePath: path,
        planContent: content,
      });
    },

    setPlanApprovalPending(sessionId: string, pending: boolean, permissions?: AllowedPrompt[]): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        planApprovalPending: pending,
        planApprovedPermissions: permissions,
      });
    },

    approvePlan(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        planMode: false,
        planApprovalPending: false,
      });
    },

    rejectPlan(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        planApprovalPending: false,
        planFilePath: undefined,
        planContent: undefined,
        planApprovedPermissions: undefined,
      });
    },

    setPendingQuestion(sessionId: string, question: PlanModeQuestion, toolUseId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        pendingQuestion: question,
        pendingQuestionToolUseId: toolUseId,
      });
    },

    clearPendingQuestion(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (!session) return;

      sessions = new Map(sessions).set(sessionId, {
        ...session,
        pendingQuestion: undefined,
        pendingQuestionToolUseId: undefined,
      });
    },

    // Clear all sessions
    clearAll(): void {
      sessions = new Map();
      activeSessionId = null;
    },
  };
}

export const sessionStore = createSessionStore();
