<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { invoke } from '@tauri-apps/api/core';
  import { appConfig } from '$lib/stores/app.svelte';

  interface Props {
    onclose: () => void;
    onselect: (sessionId: string) => void;
  }

  let { onclose, onselect }: Props = $props();

  interface Session {
    sessionId: string;
    firstPrompt: string;
    messageCount: number;
    created: string;
    modified: string;
  }

  let sessions = $state<Session[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement;

  const filteredSessions = $derived(
    sessions.filter(s =>
      s.firstPrompt.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  $effect(() => {
    loadSessions();
    // Focus input on mount
    setTimeout(() => inputEl?.focus(), 50);
  });

  async function loadSessions() {
    try {
      const workspacePath = appConfig.workspace?.path || '.';
      sessions = await invoke<Session[]>('list_sessions', { workspacePath });
    } catch (e) {
      console.error('Failed to load sessions:', e);
      sessions = [];
    } finally {
      loading = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredSessions.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter' && filteredSessions[selectedIndex]) {
      e.preventDefault();
      onselect(filteredSessions[selectedIndex].sessionId);
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function truncate(str: string, len: number): string {
    return str.length > len ? str.slice(0, len) + '...' : str;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown} role="button" tabindex="-1" transition:fade={{ duration: 150 }}>
  <div class="palette" transition:fly={{ y: -10, duration: 150 }}>
    <div class="search-box">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
      <input
        bind:this={inputEl}
        bind:value={searchQuery}
        type="text"
        placeholder="Search threads..."
        oninput={() => selectedIndex = 0}
      />
      <kbd>esc</kbd>
    </div>

    <div class="results">
      {#if loading}
        <div class="empty">
          <span class="spinner"></span>
          <span>Loading threads...</span>
        </div>
      {:else if filteredSessions.length === 0}
        <div class="empty">
          <span class="empty-icon">◇</span>
          <span>{searchQuery ? 'No matching threads' : 'No threads yet'}</span>
        </div>
      {:else}
        {#each filteredSessions as session, i (session.sessionId)}
          <button
            class="result-item"
            class:selected={i === selectedIndex}
            onclick={() => onselect(session.sessionId)}
            onmouseenter={() => selectedIndex = i}
          >
            <div class="result-content">
              <span class="result-prompt">{truncate(session.firstPrompt, 60)}</span>
              <span class="result-meta">
                {session.messageCount} messages
              </span>
            </div>
            <span class="result-time">{formatDate(session.modified)}</span>
          </button>
        {/each}
      {/if}
    </div>

    <div class="footer">
      <span class="hint">
        <kbd>↑</kbd><kbd>↓</kbd> navigate
        <kbd>↵</kbd> open
        <kbd>esc</kbd> close
      </span>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
  }

  .palette {
    background: var(--white);
    border-radius: 12px;
    width: 90%;
    max-width: 560px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    overflow: hidden;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--gray-200);
  }

  .search-icon {
    width: 18px;
    height: 18px;
    color: var(--gray-400);
    flex-shrink: 0;
  }

  .search-box input {
    flex: 1;
    border: none;
    background: none;
    font-family: var(--font-sans);
    font-size: var(--text-base);
    color: var(--off-black);
    outline: none;
  }

  .search-box input::placeholder {
    color: var(--gray-400);
  }

  .search-box kbd {
    padding: 2px 6px;
    background: var(--gray-100);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-500);
  }

  .results {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 3rem 1rem;
    color: var(--gray-500);
    font-size: var(--text-sm);
  }

  .empty-icon {
    font-size: 1.5rem;
    color: var(--gray-300);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--gray-200);
    border-top-color: var(--gray-500);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .result-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .result-item:hover,
  .result-item.selected {
    background: var(--gray-100);
  }

  .result-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .result-prompt {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
  }

  .result-time {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-400);
    flex-shrink: 0;
  }

  .footer {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--gray-200);
    background: var(--gray-50);
  }

  .hint {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-500);
  }

  .hint kbd {
    padding: 2px 5px;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
  }
</style>
