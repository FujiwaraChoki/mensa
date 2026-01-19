<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { toolActivity } from '$lib/stores/app.svelte';
  import type { ToolName } from '$lib/types';

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

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatInput(input: string | undefined, tool: ToolName): string {
    if (!input) return '';

    // Shorten file paths
    if (tool === 'Read' || tool === 'Write' || tool === 'Edit' || tool === 'Glob') {
      const parts = input.split('/');
      if (parts.length > 3) {
        return '.../' + parts.slice(-2).join('/');
      }
    }

    // Truncate long strings
    if (input.length > 40) {
      return input.slice(0, 37) + '...';
    }

    return input;
  }
</script>

<aside class="tools-panel" transition:fly={{ x: 20, duration: 150 }}>
  <div class="tools-header">
    <span class="tools-title">Activity</span>
    {#if toolActivity.recent.length > 0}
      <span class="activity-count">{toolActivity.recent.length}</span>
    {/if}
  </div>

  <div class="tools-list">
    {#if toolActivity.recent.length === 0}
      <div class="empty-state" in:fade>
        <span class="empty-icon">◇</span>
        <p class="empty-text">Tool activity will appear here</p>
      </div>
    {:else}
      {#each toolActivity.recent as tool (tool.id)}
        <div
          class="tool-item"
          class:running={tool.status === 'running'}
          class:error={tool.status === 'error'}
          in:fly={{ y: -10, duration: 200, easing: quintOut }}
        >
          <div class="tool-icon" class:spinning={tool.status === 'running'}>
            {toolIcons[tool.tool] || '⚡'}
          </div>
          <div class="tool-info">
            <span class="tool-name">{tool.tool}</span>
            {#if tool.input}
              <span class="tool-input">{formatInput(tool.input, tool.tool)}</span>
            {/if}
          </div>
          <div class="tool-meta">
            {#if tool.status === 'running'}
              <span class="spinner"></span>
            {:else if tool.status === 'completed'}
              <span class="check">✓</span>
            {:else}
              <span class="error-icon">×</span>
            {/if}
            <span class="tool-time">{formatTime(tool.startedAt)}</span>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .tools-panel {
    width: 280px;
    border-left: 1px solid var(--gray-200);
    background: var(--gray-50);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .tools-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--gray-200);
  }

  .tools-title {
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--gray-500);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .activity-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: var(--gray-200);
    color: var(--gray-600);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    border-radius: 9px;
  }

  .tools-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    text-align: center;
  }

  .empty-icon {
    font-size: var(--text-xl);
    color: var(--gray-300);
    margin-bottom: 0.75rem;
  }

  .empty-text {
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    color: var(--gray-400);
    margin: 0;
  }

  .tool-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    border-radius: 8px;
    transition: background var(--transition-fast);
  }

  .tool-item:hover {
    background: var(--white);
  }

  .tool-item.running {
    background: var(--white);
  }

  .tool-item.error {
    background: rgba(220, 38, 38, 0.04);
  }

  .tool-icon {
    font-size: var(--text-sm);
    color: var(--gray-500);
    width: 16px;
    text-align: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .tool-icon.spinning {
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .tool-info {
    flex: 1;
    min-width: 0;
  }

  .tool-name {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--off-black);
  }

  .tool-input {
    display: block;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .tool-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
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

  .tool-time {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--gray-400);
  }
</style>
