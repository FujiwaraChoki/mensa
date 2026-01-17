// Claude CLI Integration via Tauri IPC
// This service handles communication with Claude via the backend

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ContentBlock } from '$lib/types';

export interface ClaudeStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done';
  content?: string;
  tool?: {
    id?: string;
    name: string;
    input?: Record<string, unknown> | string;
    result?: string;
  };
  error?: string;
}

export type StreamCallback = (event: ClaudeStreamEvent) => void;

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
}

/**
 * Send a message to Claude CLI and stream the response
 */
export async function queryClaudeStreaming(
  prompt: string | ContentBlock[],
  workingDirectory: string,
  onEvent: StreamCallback,
  config?: ClaudeQueryConfig,
  resumeSession?: string
): Promise<void> {
  const hasAttachments = typeof prompt !== 'string';
  const promptStr = hasAttachments ? JSON.stringify(prompt) : prompt;
  const logPrompt = hasAttachments ? '[content blocks]' : prompt.substring(0, 50);
  console.log('[claude] queryClaudeStreaming called with prompt:', logPrompt);

  let unlistenStream: UnlistenFn | null = null;
  let unlistenDone: UnlistenFn | null = null;

  let unlistenStderr: UnlistenFn | null = null;
  let stderrOutput = '';

  try {
    // Listen for streaming data
    unlistenStream = await listen<string>('claude-stream', (event) => {
      const line = event.payload;
      console.log('[claude-stream] RAW LINE:', line);
      if (!line.trim()) return;

      try {
        const msg = JSON.parse(line) as ClaudeJsonMessage;
        console.log('[claude-stream] PARSED JSON:', msg.type);
        handleClaudeMessage(msg, onEvent);
      } catch (e) {
        // Plain text output
        console.log('[claude-stream] JSON PARSE FAILED:', e, 'line:', line.substring(0, 100));
        if (line.trim()) {
          onEvent({ type: 'text', content: line + '\n' });
        }
      }
    });

    // Listen for stderr (error messages)
    unlistenStderr = await listen<string>('claude-stderr', (event) => {
      stderrOutput += event.payload + '\n';
      console.error('[claude stderr]', event.payload);
    });

    // Listen for completion
    unlistenDone = await listen<number>('claude-done', (event) => {
      const code = event.payload;
      if (code !== 0) {
        // Filter out debug messages (lines starting with [claude-query])
        const errorLines = stderrOutput
          .split('\n')
          .filter(line => !line.startsWith('[claude-query]'))
          .join('\n')
          .trim();
        const errorMsg = errorLines || `Claude exited with code ${code}`;
        onEvent({ type: 'error', error: errorMsg });
      }
      onEvent({ type: 'done' });

      // Cleanup listeners
      unlistenStream?.();
      unlistenStderr?.();
      unlistenDone?.();
    });

    // Start the Claude query
    console.log('[claude] Starting invoke query_claude...');
    await invoke('query_claude', {
      prompt: promptStr,
      workingDir: workingDirectory,
      config: config ? JSON.stringify(config) : null,
      resumeSession: resumeSession || null,
      hasAttachments: hasAttachments || null
    });
    console.log('[claude] invoke query_claude completed');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    onEvent({ type: 'error', error: errorMsg });
    onEvent({ type: 'done' });

    // Cleanup listeners on error
    unlistenStream?.();
    unlistenStderr?.();
    unlistenDone?.();
  }
}

// Track tool_use IDs to tool names for matching results
const toolUseIdToName = new Map<string, string>();

function handleClaudeMessage(msg: ClaudeJsonMessage, onEvent: StreamCallback): void {
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
    console.log('[claude] System message (ignored):', msg.subtype || 'unknown');
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
