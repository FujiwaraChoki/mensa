<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { SubagentGroup, ToolExecution } from '$lib/types';
  import InlineTool from './InlineTool.svelte';

  interface Props {
    group: SubagentGroup;
    tools: ToolExecution[];
  }

  let { group, tools }: Props = $props();

  let expanded = $state(false);

  const subagentIcons: Record<string, string> = {
    Explore: '/',
    Plan: '~',
    Bash: '$',
    'general-purpose': '*'
  };

  function toggle() {
    expanded = !expanded;
  }
</script>

<div class="subagent-group" class:expanded class:running={group.status === 'running'} class:error={group.status === 'error'}>
  <button class="subagent-header" onclick={toggle} type="button">
    <span class="subagent-icon" class:spinning={group.status === 'running'}>
      {subagentIcons[group.subagentType] || '>'}
    </span>
    <span class="subagent-type">{group.subagentType}</span>
    <span class="subagent-desc">{group.description}</span>
    <span class="tool-count">{tools.length} {tools.length === 1 ? 'tool' : 'tools'}</span>
    <span class="subagent-status">
      {#if group.status === 'running'}
        <span class="spinner"></span>
      {:else if group.status === 'completed'}
        <span class="check">ok</span>
      {:else}
        <span class="error-icon">x</span>
      {/if}
    </span>
    <span class="expand-icon" class:rotated={expanded}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </span>
  </button>

  {#if expanded}
    <div class="subagent-tools" transition:slide={{ duration: 150 }}>
      {#each tools as tool (tool.id)}
        <InlineTool {tool} compact={true} />
      {/each}
      {#if tools.length === 0}
        <div class="no-tools">No tools executed</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .subagent-group {
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    background: var(--gray-50);
    margin-bottom: 0.5rem;
    overflow: hidden;
    transition: all var(--transition-fast);
  }

  .subagent-group.running {
    border-color: var(--gray-300);
    background: var(--white);
  }

  .subagent-group.error {
    border-color: rgba(220, 38, 38, 0.3);
    background: rgba(220, 38, 38, 0.04);
  }

  .subagent-header {
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

  .subagent-header:hover {
    background: var(--gray-100);
  }

  .subagent-icon {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--gray-500);
    flex-shrink: 0;
    width: 16px;
    text-align: center;
  }

  .subagent-icon.spinning {
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .subagent-type {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--off-black);
    flex-shrink: 0;
  }

  .subagent-desc {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .tool-count {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-400);
    background: var(--gray-100);
    padding: 2px 6px;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .subagent-group.running .tool-count {
    background: var(--gray-200);
  }

  .subagent-status {
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
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-500);
  }

  .error-icon {
    color: #dc2626;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
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

  .subagent-tools {
    padding: 0.25rem 0.75rem 0.75rem;
    padding-left: 1.5rem;
    border-top: 1px solid var(--gray-200);
  }

  .no-tools {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-400);
    padding: 0.5rem 0;
  }
</style>
