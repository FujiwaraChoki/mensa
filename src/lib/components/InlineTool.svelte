<script lang="ts">
  import { slide } from 'svelte/transition';
  import DiffViewer from './DiffViewer.svelte';
  import type { ToolExecution, ToolName } from '$lib/types';

  interface Props {
    tool: ToolExecution;
    compact?: boolean;  // Reduced padding/margin for nested display
  }

  let { tool, compact = false }: Props = $props();

  let expanded = $state(false);
  const patch = $derived(getPatchForTool(tool));

  const toolIcons: Partial<Record<ToolName, string>> = {
    Read: '◇',
    Write: '◆',
    Edit: '✎',
    Bash: '▣',
    Glob: '◎',
    Grep: '⌕',
    WebSearch: '◉',
    WebFetch: '↗',
    Task: '⟡',
    TodoWrite: '☐',
    Skill: '★'
  };

  function formatInput(input: string | undefined, toolName: ToolName): string {
    if (!input) return '';

    // For file operations, show shortened path
    if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit' || toolName === 'Glob') {
      try {
        const parsed = JSON.parse(input);
        const path = parsed.file_path || parsed.path || parsed.pattern || '';
        if (path) {
          const parts = path.split('/');
          if (parts.length > 2) {
            return '.../' + parts.slice(-2).join('/');
          }
          return path;
        }
      } catch {
        // Not JSON, try to extract path directly
        const parts = input.split('/');
        if (parts.length > 2) {
          return '.../' + parts.slice(-2).join('/');
        }
      }
    }

    // For Bash, show the command
    if (toolName === 'Bash') {
      try {
        const parsed = JSON.parse(input);
        const cmd = parsed.command || '';
        if (cmd.length > 50) {
          return cmd.slice(0, 47) + '...';
        }
        return cmd;
      } catch {
        if (input.length > 50) {
          return input.slice(0, 47) + '...';
        }
        return input;
      }
    }

    // For Grep, show the pattern
    if (toolName === 'Grep') {
      try {
        const parsed = JSON.parse(input);
        return parsed.pattern || input.slice(0, 30);
      } catch {
        return input.slice(0, 30);
      }
    }

    // For Task, show the description
    if (toolName === 'Task') {
      try {
        const parsed = JSON.parse(input);
        return parsed.description || parsed.subagent_type || input.slice(0, 30);
      } catch {
        return input.slice(0, 30);
      }
    }

    // For Skill, show the skill name and args
    if (toolName === 'Skill') {
      try {
        const parsed = JSON.parse(input);
        const skillName = parsed.skill || 'unknown';
        const args = parsed.args ? ` ${parsed.args.slice(0, 20)}...` : '';
        return `/${skillName}${args}`;
      } catch {
        return input.slice(0, 30);
      }
    }

    // Truncate long strings
    if (input.length > 40) {
      return input.slice(0, 37) + '...';
    }

    return input;
  }

  function formatOutput(output: string | undefined): string {
    if (!output) return 'No output';
    return output;
  }

  function extractPatch(output: string | undefined): string | null {
    if (!output) return null;
    const fenced = output.match(/```diff\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }
    const hasUnifiedMarkers = /^(diff --git|@@|---|\+\+\+)/m.test(output);
    return hasUnifiedMarkers ? output.trim() : null;
  }

  function parseInputJson(input: string | undefined): Record<string, unknown> | null {
    if (!input) return null;
    try {
      return JSON.parse(input) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  function buildEditPatch(toolInput: Record<string, unknown>): string | null {
    const filePath = toolInput.file_path as string | undefined;
    const oldString = toolInput.old_string as string | undefined;
    const newString = toolInput.new_string as string | undefined;
    if (!filePath || oldString === undefined || newString === undefined) return null;

    const oldLines = oldString === '' ? [''] : oldString.split('\n');
    const newLines = newString === '' ? [''] : newString.split('\n');
    const oldCount = oldLines.length;
    const newCount = newLines.length;

    const header = [
      `diff --git a/${filePath} b/${filePath}`,
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      `@@ -1,${oldCount} +1,${newCount} @@`
    ];

    const body = [
      ...oldLines.map(line => `-${line}`),
      ...newLines.map(line => `+${line}`)
    ];

    return [...header, ...body].join('\n');
  }

  function buildWritePatch(toolInput: Record<string, unknown>): string | null {
    const filePath = toolInput.file_path as string | undefined;
    const content = toolInput.content as string | undefined;
    if (!filePath || content === undefined) return null;

    const newLines = content === '' ? [''] : content.split('\n');
    const newCount = newLines.length;

    const header = [
      `diff --git a/${filePath} b/${filePath}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${filePath}`,
      `@@ -0,0 +1,${newCount} @@`
    ];

    const body = newLines.map(line => `+${line}`);
    return [...header, ...body].join('\n');
  }

  function buildPatchFromTool(tool: ToolExecution): string | null {
    const input = parseInputJson(tool.input);
    if (!input) return null;
    if (tool.tool === 'Edit') {
      return buildEditPatch(input);
    }
    if (tool.tool === 'Write') {
      return buildWritePatch(input);
    }
    return null;
  }

  function getPatchForTool(tool: ToolExecution): string | null {
    // Task tools return text summaries, not diffs - skip diff parsing
    if (tool.tool === 'Task') {
      return null;
    }
    return extractPatch(tool.output) ?? buildPatchFromTool(tool);
  }

  function toggle() {
    expanded = !expanded;
  }
</script>

<div class="inline-tool" class:expanded class:running={tool.status === 'running'} class:error={tool.status === 'error'} class:compact>
  <button class="tool-header" onclick={toggle} type="button">
    <span class="tool-icon" class:spinning={tool.status === 'running'}>
      {toolIcons[tool.tool] || '⚡'}
    </span>
    <span class="tool-name">{tool.tool}</span>
    {#if tool.input}
      <span class="tool-summary">{formatInput(tool.input, tool.tool)}</span>
    {/if}
    <span class="tool-status">
      {#if tool.status === 'running'}
        <span class="spinner"></span>
      {:else if tool.status === 'completed'}
        <span class="check">✓</span>
      {:else}
        <span class="error-icon">×</span>
      {/if}
    </span>
    <span class="expand-icon" class:rotated={expanded}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </span>
  </button>

  {#if expanded}
    <div class="tool-details" transition:slide={{ duration: 150 }}>
      {#if tool.input && tool.tool !== 'Edit' && tool.tool !== 'Write'}
        <div class="detail-section">
          <span class="detail-label">Input</span>
          <pre class="detail-content">{tool.input}</pre>
        </div>
      {/if}
      {#if tool.output || tool.status === 'completed'}
        <div class="detail-section">
          <span class="detail-label">Output</span>
          {#if patch}
            <div class="detail-diff">
              <DiffViewer patch={patch} />
            </div>
          {:else}
            <pre class="detail-content">{formatOutput(tool.output)}</pre>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .inline-tool {
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    background: var(--gray-50);
    margin-bottom: 0.5rem;
    overflow: hidden;
    transition: all var(--transition-fast);
  }

  .inline-tool.running {
    border-color: var(--gray-300);
    background: var(--white);
  }

  .inline-tool.error {
    border-color: rgba(220, 38, 38, 0.3);
    background: rgba(220, 38, 38, 0.04);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .tool-header:hover {
    background: var(--gray-100);
  }

  .tool-icon {
    font-size: var(--text-sm);
    color: var(--gray-500);
    flex-shrink: 0;
  }

  .tool-icon.spinning {
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .tool-name {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--off-black);
    flex-shrink: 0;
  }

  .tool-summary {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .tool-status {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .spinner {
    display: block;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--gray-300);
    border-top-color: var(--off-black);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .check {
    color: var(--off-black);
    font-size: var(--text-xs);
  }

  .error-icon {
    color: #dc2626;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    transition: transform var(--transition-fast);
  }

  .expand-icon svg {
    width: 14px;
    height: 14px;
    color: var(--gray-400);
  }

  .expand-icon.rotated {
    transform: rotate(180deg);
  }

  .tool-details {
    padding: 0 0.75rem 0.75rem;
    border-top: 1px solid var(--gray-200);
    margin-top: 0;
  }

  .detail-section {
    margin-top: 0.5rem;
  }

  .detail-label {
    display: block;
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--gray-400);
    margin-bottom: 0.25rem;
  }

  .detail-content {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-600);
    background: var(--white);
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--gray-200);
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
  }

  .detail-diff {
    border: 1px solid var(--gray-200);
    border-radius: 4px;
    background: var(--white);
    overflow: hidden;
  }

  /* Compact mode for nested tools */
  .inline-tool.compact {
    margin-bottom: 0.25rem;
    border-radius: 6px;
  }

  .inline-tool.compact .tool-header {
    padding: 0.375rem 0.5rem;
    gap: 0.375rem;
  }

  .inline-tool.compact .tool-icon {
    font-size: 11px;
  }

  .inline-tool.compact .tool-name {
    font-size: 11px;
  }

  .inline-tool.compact .tool-summary {
    font-size: 10px;
  }

  .inline-tool.compact .tool-details {
    padding: 0 0.5rem 0.5rem;
  }

  .inline-tool.compact .detail-content {
    font-size: 10px;
    max-height: 150px;
  }
</style>
