// Claude CLI Integration via Tauri IPC
// This service handles communication with Claude via the backend

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ContentBlock, SettingSource, SlashCommand, PlanModeQuestion, AllowedPrompt } from '$lib/types';

export interface ClaudeStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done' | 'system_init' | 'cancelled' | 'ask_user_question' | 'exit_plan_mode';
  queryId?: string;
  sessionId?: string;  // Claude backend session ID for resume functionality
  content?: string;
  tool?: {
    id?: string;
    name: string;
    input?: Record<string, unknown> | string;
    result?: string;
  };
  error?: string;
  slashCommands?: SlashCommand[];
  reason?: string;  // For cancelled events
  // For ask_user_question
  questions?: PlanModeQuestion[];
  toolUseId?: string;
  // For exit_plan_mode
  planFilePath?: string;
  allowedPrompts?: AllowedPrompt[];
  planContent?: string;
}

export type StreamCallback = (event: ClaudeStreamEvent) => void;

// Stream payload from backend with query_id
interface StreamPayload {
  query_id: string;
  data: string;
}

// Done payload from backend
interface DonePayload {
  query_id: string;
  code: number;
}

// Return type for streaming query
export interface QueryHandle {
  queryId: string;
  cancel: () => Promise<void>;
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;           // tool_use ID
  input?: unknown;
  tool_use_id?: string;  // for tool_result
  content?: string;      // tool_result content
  is_error?: boolean;
}

interface ClaudeJsonMessage {
  type: string;
  subtype?: string;
  tool_name?: string;
  tool_use_id?: string;
  id?: string;
  input?: unknown;
  patch?: string;
  // For assistant messages
  message?: {
    content?: ClaudeContentBlock[] | string;
  };
  // For direct content (legacy)
  content?: ClaudeContentBlock[] | string;
  result?: string;
  data?: Record<string, unknown>;
  tool_use_result?: string;  // SDK includes this for user messages
  error?: string;
}

export interface ClaudeQueryConfig {
  permissionMode?: string;
  maxTurns?: number;
  mcpServers?: Array<{
    id: string;
    name: string;
    type: 'stdio' | 'sse';
    enabled: boolean;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  }>;
  // Skills configuration
  settingSources?: SettingSource[];
  enableSkills?: boolean;
}

/**
 * Send a message to Claude CLI and stream the response
 * Returns a handle with the queryId and a cancel function
 */
export async function queryClaudeStreaming(
  prompt: string | ContentBlock[],
  workingDirectory: string,
  onEvent: StreamCallback,
  config?: ClaudeQueryConfig,
  resumeSession?: string
): Promise<QueryHandle> {
  const hasAttachments = typeof prompt !== 'string';
  const promptStr = hasAttachments ? JSON.stringify(prompt) : prompt;
  const logPrompt = hasAttachments ? '[content blocks]' : prompt.substring(0, 50);
  console.log('[claude] queryClaudeStreaming called with prompt:', logPrompt);

  let unlistenStream: UnlistenFn | null = null;
  let unlistenDone: UnlistenFn | null = null;
  let unlistenStderr: UnlistenFn | null = null;

  // Per-session tool tracking (no longer global)
  const sessionToolUseIdToName = new Map<string, string>();
  const stderrByQuery = new Map<string, string>();

  // Will be set after invoke returns
  let resolvedQueryId = '';

  // Helper to wrap events with queryId
  const emitEvent = (event: ClaudeStreamEvent) => {
    onEvent({ ...event, queryId: resolvedQueryId });
  };

  // Helper to handle messages with session-scoped tool tracking
  const handleMessage = (msg: ClaudeJsonMessage) => {
    handleClaudeMessage(msg, emitEvent, sessionToolUseIdToName);
  };

  try {
    // Listen for streaming data
    unlistenStream = await listen<StreamPayload>('claude-stream', (event) => {
      const { query_id, data } = event.payload;

      // Only process events for this query
      if (resolvedQueryId && query_id !== resolvedQueryId) return;

      console.log('[claude-stream] RAW LINE for query', query_id, ':', data);
      if (!data.trim()) return;

      try {
        const msg = JSON.parse(data) as ClaudeJsonMessage;
        console.log('[claude-stream] PARSED JSON:', msg.type);
        handleMessage(msg);
      } catch (e) {
        // Plain text output
        console.log('[claude-stream] JSON PARSE FAILED:', e, 'line:', data.substring(0, 100));
        if (data.trim()) {
          emitEvent({ type: 'text', content: data + '\n' });
        }
      }
    });

    // Listen for stderr (error messages)
    unlistenStderr = await listen<StreamPayload>('claude-stderr', (event) => {
      const { query_id, data } = event.payload;
      if (resolvedQueryId && query_id !== resolvedQueryId) return;

      const current = stderrByQuery.get(query_id) || '';
      stderrByQuery.set(query_id, current + data + '\n');
      console.error('[claude stderr]', query_id, data);
    });

    // Listen for completion
    unlistenDone = await listen<DonePayload>('claude-done', (event) => {
      const { query_id, code } = event.payload;

      // Only process events for this query
      if (resolvedQueryId && query_id !== resolvedQueryId) return;

      if (code !== 0) {
        // Filter out debug messages (lines starting with [claude-query])
        const stderrOutput = stderrByQuery.get(query_id) || '';
        const errorLines = stderrOutput
          .split('\n')
          .filter(line => !line.startsWith('[claude-query]'))
          .join('\n')
          .trim();
        const errorMsg = errorLines || `Claude exited with code ${code}`;
        emitEvent({ type: 'error', error: errorMsg });
      }
      emitEvent({ type: 'done' });

      // Cleanup listeners
      unlistenStream?.();
      unlistenStderr?.();
      unlistenDone?.();

      // Clean up session data
      stderrByQuery.delete(query_id);
    });

    // Start the Claude query - now returns the query ID
    console.log('[claude] Starting invoke query_claude...');
    resolvedQueryId = await invoke<string>('query_claude', {
      prompt: promptStr,
      workingDir: workingDirectory,
      config: config ? JSON.stringify(config) : null,
      resumeSession: resumeSession || null,
      hasAttachments: hasAttachments || null
    });
    console.log('[claude] invoke query_claude returned queryId:', resolvedQueryId);

    // Return handle with cancel function
    return {
      queryId: resolvedQueryId,
      cancel: async () => {
        console.log('[claude] Cancelling query:', resolvedQueryId);
        try {
          await invoke('cancel_query', { queryId: resolvedQueryId });
          emitEvent({ type: 'cancelled', reason: 'user_cancelled' });
          emitEvent({ type: 'done' });
        } catch (e) {
          console.error('[claude] Failed to cancel query:', e);
        }

        // Cleanup listeners
        unlistenStream?.();
        unlistenStderr?.();
        unlistenDone?.();
      }
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    onEvent({ type: 'error', error: errorMsg, queryId: resolvedQueryId || undefined });
    onEvent({ type: 'done', queryId: resolvedQueryId || undefined });

    // Cleanup listeners on error
    unlistenStream?.();
    unlistenStderr?.();
    unlistenDone?.();

    // Return a no-op handle
    return {
      queryId: resolvedQueryId || '',
      cancel: async () => {}
    };
  }
}

// Extract slash commands from system init data
function extractSlashCommands(data: Record<string, unknown>): SlashCommand[] {
  const commands: SlashCommand[] = [];

  // The SDK may include slash_commands in the init data
  const slashCmds = data.slash_commands as Array<{
    name?: string;
    description?: string;
    source?: string;
  }> | undefined;

  if (Array.isArray(slashCmds)) {
    for (const cmd of slashCmds) {
      if (cmd.name) {
        commands.push({
          name: cmd.name,
          description: cmd.description,
          source: (cmd.source === 'project' ? 'project' : 'user') as SettingSource
        });
      }
    }
  }

  return commands;
}

function handleClaudeMessage(
  msg: ClaudeJsonMessage,
  onEvent: StreamCallback,
  toolUseIdToName: Map<string, string>
): void {
  // Debug: log all messages from Claude
  console.log('[claude] RAW MESSAGE:', msg.type, msg);

  const content = msg.message?.content || msg.content;
  console.log('[claude] EXTRACTED CONTENT:', content, 'isArray:', Array.isArray(content));

  // Handle assistant messages (contains text and tool_use blocks)
  if (msg.type === 'assistant' && content) {
    if (typeof content === 'string') {
      onEvent({ type: 'text', content });
      return;
    }

    if (Array.isArray(content)) {
      console.log('[claude] Processing assistant message with', content.length, 'blocks');
      for (const block of content) {
        console.log('[claude] BLOCK:', block?.type, block);

        if (!block || typeof block !== 'object') {
          console.log('[claude] WARNING: Invalid block, skipping');
          continue;
        }

        if (block.type === 'text' && block.text) {
          onEvent({ type: 'text', content: block.text });
        } else if (block.type === 'tool_use') {
          // Extract name with fallback
          const name = block.name || (block as unknown as Record<string, unknown>).tool_name as string || 'unknown';
          console.log('[claude] TOOL_USE FOUND:', name, 'id:', block.id, 'input:', block.input);

          if (name && name !== 'unknown') {
            // Track the tool_use ID to name mapping
            if (block.id) {
              toolUseIdToName.set(block.id, name);
            }

            // Check for plan mode special tools
            const input = block.input as Record<string, unknown>;
            if (name === 'AskUserQuestion') {
              console.log('[claude] AskUserQuestion tool detected');
              const questions = input?.questions as PlanModeQuestion[] || [];
              onEvent({
                type: 'ask_user_question',
                questions,
                toolUseId: block.id,
              });
              // Also emit as regular tool_use for UI display
            } else if (name === 'ExitPlanMode') {
              console.log('[claude] ExitPlanMode tool detected, input:', input);
              const allowedPrompts = input?.allowedPrompts as AllowedPrompt[] || [];
              const planContent = input?.plan as string || '';
              onEvent({
                type: 'exit_plan_mode',
                allowedPrompts,
                toolUseId: block.id,
                planContent,
              });
              // Also emit as regular tool_use for UI display
            }

            const event = {
              type: 'tool_use' as const,
              tool: {
                id: block.id,
                name,
                input: block.input as Record<string, unknown>
              }
            };
            console.log('[claude] EMITTING tool_use event:', event);
            onEvent(event);
          } else {
            console.log('[claude] WARNING: tool_use block has no valid name, skipping');
          }
        }
      }
      return;
    }
  }

  // Handle tool_call messages from Agent SDK streams
  if (msg.type === 'tool_call') {
    const name = msg.tool_name || 'unknown';
    const toolId = msg.id;
    console.log('[claude] TOOL_CALL FOUND:', name, 'id:', toolId, 'input:', msg.input);

    if (name && name !== 'unknown') {
      if (toolId) {
        toolUseIdToName.set(toolId, name);
      }

      // Check for plan mode special tools
      const input = msg.input as Record<string, unknown>;
      if (name === 'AskUserQuestion') {
        console.log('[claude] AskUserQuestion tool detected (tool_call)');
        const questions = input?.questions as PlanModeQuestion[] || [];
        onEvent({
          type: 'ask_user_question',
          questions,
          toolUseId: toolId,
        });
      } else if (name === 'ExitPlanMode') {
        console.log('[claude] ExitPlanMode tool detected (tool_call), input:', input);
        const allowedPrompts = input?.allowedPrompts as AllowedPrompt[] || [];
        const planContent = input?.plan as string || '';
        onEvent({
          type: 'exit_plan_mode',
          allowedPrompts,
          toolUseId: toolId,
          planContent,
        });
      }

      const event = {
        type: 'tool_use' as const,
        tool: {
          id: toolId,
          name,
          input: msg.input as Record<string, unknown>
        }
      };
      console.log('[claude] EMITTING tool_use event:', event);
      onEvent(event);
    }
    return;
  }

  // Handle tool_result messages from Agent SDK streams
  if (msg.type === 'tool_result') {
    const toolUseId = msg.tool_use_id || msg.id;
    const toolName = msg.tool_name || (toolUseId ? toolUseIdToName.get(toolUseId) : undefined) || 'unknown';
    const resultContent = msg.patch
      ? msg.patch
      : typeof msg.result === 'string'
        ? msg.result
        : typeof msg.result === 'object' && msg.result !== null
          ? JSON.stringify(msg.result, null, 2)
          : typeof msg.content === 'string'
            ? msg.content
            : '';

    console.log('[claude] TOOL_RESULT MESSAGE:', toolName, 'id:', toolUseId, 'content length:', resultContent?.length);

    const event = {
      type: 'tool_result' as const,
      tool: {
        id: toolUseId,
        name: toolName,
        result: resultContent || ''
      }
    };
    console.log('[claude] EMITTING tool_result event:', event);
    onEvent(event);

    if (toolUseId) {
      toolUseIdToName.delete(toolUseId);
    }
    return;
  }

  // Handle user messages (contains tool_result blocks)
  if (msg.type === 'user' && content && Array.isArray(content)) {
    console.log('[claude] Processing user message with', content.length, 'blocks');
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;

      if (block.type === 'tool_result') {
        const toolUseId = block.tool_use_id;
        const toolName = toolUseId ? toolUseIdToName.get(toolUseId) : undefined;
        const resultContent = block.content;

        console.log('[claude] TOOL_RESULT FOUND:', toolName, 'id:', toolUseId, 'content length:', resultContent?.length);

        const event = {
          type: 'tool_result' as const,
          tool: {
            name: toolName || 'unknown',
            result: resultContent || ''
          }
        };
        console.log('[claude] EMITTING tool_result event:', event);
        onEvent(event);

        // Clean up the mapping
        if (toolUseId) {
          toolUseIdToName.delete(toolUseId);
        }
      }
    }
    return;
  }

  // Handle system messages
  if (msg.type === 'system') {
    console.log('[claude] System message:', msg.subtype || 'unknown');
    // Handle system init to extract slash commands and session_id
    if (msg.subtype === 'init' && msg.data) {
      const slashCommands = extractSlashCommands(msg.data);
      const sessionId = msg.data.session_id as string | undefined;

      if (slashCommands.length > 0 || sessionId) {
        console.log('[claude] Found', slashCommands.length, 'slash commands, session_id:', sessionId);
        onEvent({ type: 'system_init', slashCommands, sessionId });
      }
    }
    return;
  }

  if (msg.type === 'error') {
    console.log('[claude] Error message:', msg.error);
    onEvent({ type: 'error', error: msg.error || 'Agent error' });
    return;
  }

  // Handle result messages
  if (msg.type === 'result') {
    console.log('[claude] Result message:', msg.subtype);
    if (msg.subtype === 'error') {
      onEvent({ type: 'error', error: msg.result || 'Query failed' });
    }
    // Don't emit text for success result - the assistant message already has it
    return;
  }

  // Handle done
  if (msg.type === 'done') {
    console.log('[claude] Done message');
    onEvent({ type: 'done' });
  }
}
