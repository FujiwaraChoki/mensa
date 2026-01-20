<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { fade } from 'svelte/transition';
  import { appConfig } from '$lib/stores/app.svelte';
  import { sessionStore } from '$lib/stores/sessions.svelte';
  import { reviewStore } from '$lib/stores/review.svelte';

  interface Props {
    visible: boolean;
    onselect: (sessionId: string) => void;
    oncreate: () => void;
  }

  let { visible, onselect, oncreate }: Props = $props();

  interface Session {
    sessionId: string;
    firstPrompt: string;
    messageCount: number;
    created: string;
    modified: string;
  }

  let sessions = $state<Session[]>([]);
  let loading = $state(true);

  // Context menu state
  let contextMenu = $state<{ x: number; y: number; session: Session } | null>(null);
  let renaming = $state<{ sessionId: string; value: string } | null>(null);
  let renameInputEl: HTMLInputElement;

  // Get in-memory sessions that are actively streaming
  const streamingSessions = $derived(
    sessionStore.sessionList.filter(s => s.status === 'streaming')
  );

  // Get claude session IDs of streaming sessions to filter from history
  const streamingClaudeSessionIds = $derived(
    new Set(streamingSessions.map(s => s.claudeSessionId).filter(Boolean))
  );

  // Get recent reviews (last 5)
  const recentReviews = $derived(
    reviewStore.reviewHistory.slice(0, 5)
  );

  $effect(() => {
    loadSessions();
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

  function handleContextMenu(e: MouseEvent, session: Session) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, session };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  async function handleDelete() {
    if (!contextMenu) return;
    const sessionId = contextMenu.session.sessionId;
    closeContextMenu();

    try {
      const workspacePath = appConfig.workspace?.path || '.';
      await invoke('delete_session', { workspacePath, sessionId });
      // Remove from local state
      sessions = sessions.filter(s => s.sessionId !== sessionId);
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  }

  function handleRename() {
    if (!contextMenu) return;
    const session = contextMenu.session;
    renaming = { sessionId: session.sessionId, value: session.firstPrompt };
    closeContextMenu();
    // Focus the input after it renders
    setTimeout(() => renameInputEl?.focus(), 10);
  }

  function handleRenameSubmit() {
    if (!renaming) return;
    // Update local state with new name
    sessions = sessions.map(s =>
      s.sessionId === renaming!.sessionId
        ? { ...s, firstPrompt: renaming!.value }
        : s
    );
    renaming = null;
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      renaming = null;
    }
  }

  function handleReviewClick(reviewId: string) {
    reviewStore.loadHistoricalReview(reviewId);
    reviewStore.openReviewPanel();
  }
</script>

<svelte:window onclick={closeContextMenu} />

<aside class="sidebar" class:visible>
  <div class="sidebar-header">
    <span class="sidebar-title">Threads</span>
    <button class="new-thread-btn" onclick={oncreate} title="New thread (⌘N)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    </button>
  </div>

  <div class="sidebar-content">
    {#if streamingSessions.length > 0}
      <div class="section">
        <span class="section-label">Active</span>
        {#each streamingSessions as session (session.id)}
          <button
            class="thread-item active"
            onclick={() => {
              sessionStore.switchToSession(session.id);
            }}
          >
            <div class="thread-info">
              <span class="thread-title">{truncate(session.title, 30)}</span>
              <span class="thread-meta">{session.messages.length} messages</span>
            </div>
            <span class="status-indicator streaming"></span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="section">
      <span class="section-label">History</span>
      {#if loading}
        <div class="loading">
          <span class="spinner"></span>
          <span>Loading...</span>
        </div>
      {:else if sessions.filter(s => !streamingClaudeSessionIds.has(s.sessionId)).length === 0}
        <div class="empty">
          <span class="empty-icon">◇</span>
          <span>No threads yet</span>
        </div>
      {:else}
        {#each sessions.filter(s => !streamingClaudeSessionIds.has(s.sessionId)) as session (session.sessionId)}
          {#if renaming?.sessionId === session.sessionId}
            <div class="thread-item renaming">
              <input
                bind:this={renameInputEl}
                bind:value={renaming.value}
                class="rename-input"
                onblur={handleRenameSubmit}
                onkeydown={handleRenameKeydown}
              />
            </div>
          {:else}
            <button
              class="thread-item"
              onclick={() => onselect(session.sessionId)}
              oncontextmenu={(e) => handleContextMenu(e, session)}
            >
              <div class="thread-info">
                <span class="thread-title">{truncate(session.firstPrompt, 30)}</span>
                <span class="thread-meta">{session.messageCount} msgs · {formatDate(session.modified)}</span>
              </div>
            </button>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Recent Reviews Section -->
    {#if recentReviews.length > 0}
      <div class="section">
        <span class="section-label">Recent Reviews</span>
        {#each recentReviews as review (review.id)}
          <button
            class="thread-item review-item"
            onclick={() => handleReviewClick(review.id)}
          >
            <div class="thread-info">
              <span class="thread-title">{review.preset.name}</span>
              <span class="thread-meta">
                <span class="review-stats">
                  {#if review.stats.critical > 0}
                    <span class="stat critical">{review.stats.critical}</span>
                  {/if}
                  {#if review.stats.warnings > 0}
                    <span class="stat warning">{review.stats.warnings}</span>
                  {/if}
                  {#if review.stats.suggestions > 0}
                    <span class="stat suggestion">{review.stats.suggestions}</span>
                  {/if}
                </span>
                · {formatDate(review.createdAt.toISOString())}
              </span>
            </div>
            <span class="review-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </span>
          </button>
        {/each}
        <button
          class="new-review-btn-sidebar"
          onclick={() => reviewStore.openReviewLauncher()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span>New Review</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="sidebar-footer">
    <span class="hint"><kbd>⌘B</kbd> toggle sidebar</span>
  </div>
</aside>

{#if contextMenu}
  <div
    class="context-menu"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}
    role="menu"
    tabindex="-1"
    transition:fade={{ duration: 100 }}
  >
    <button class="context-menu-item" onclick={handleRename}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
      <span>Rename</span>
    </button>
    <button class="context-menu-item danger" onclick={handleDelete}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        <line x1="10" y1="11" x2="10" y2="17"/>
        <line x1="14" y1="11" x2="14" y2="17"/>
      </svg>
      <span>Delete</span>
    </button>
  </div>
{/if}

<style>
  .sidebar {
    width: 280px;
    height: 100%;
    background: var(--white);
    border-right: 1px solid var(--gray-200);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    margin-left: -280px;
    opacity: 0;
    visibility: hidden;
    will-change: margin-left, opacity;
    transition: margin-left 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                visibility 0.2s;
  }

  .sidebar.visible {
    margin-left: 0;
    opacity: 1;
    visibility: visible;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--gray-200);
  }

  .sidebar-title {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--off-black);
  }

  .new-thread-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .new-thread-btn:hover {
    background: var(--gray-100);
  }

  .new-thread-btn svg {
    width: 16px;
    height: 16px;
    color: var(--gray-500);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .section {
    margin-bottom: 1rem;
  }

  .section-label {
    display: block;
    padding: 0.5rem 0.75rem;
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--gray-400);
  }

  .thread-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0.625rem 0.75rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
    user-select: none;
    -webkit-user-select: none;
  }

  .thread-item:hover {
    background: var(--gray-100);
  }

  .thread-item.active {
    background: var(--gray-100);
  }

  .thread-item.renaming {
    cursor: default;
  }

  .rename-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .rename-input:focus {
    border-color: var(--gray-400);
  }

  .thread-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .thread-title {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thread-meta {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-500);
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-indicator.streaming {
    background: #22c55e;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .loading, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 2rem 1rem;
    color: var(--gray-500);
    font-size: var(--text-sm);
  }

  .empty-icon {
    font-size: 1.25rem;
    color: var(--gray-300);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--gray-200);
    border-top-color: var(--gray-500);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .sidebar-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--gray-200);
    background: var(--gray-50);
  }

  .hint {
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

  /* Context Menu */
  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 160px;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05);
    padding: 4px;
    overflow: hidden;
  }

  .context-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .context-menu-item:hover {
    background: var(--gray-100);
  }

  .context-menu-item.danger {
    color: #dc2626;
  }

  .context-menu-item.danger:hover {
    background: #fef2f2;
  }

  .context-menu-item svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* Review section styles */
  .review-item {
    position: relative;
  }

  .review-icon {
    width: 16px;
    height: 16px;
    color: var(--gray-400);
    flex-shrink: 0;
  }

  .review-icon svg {
    width: 100%;
    height: 100%;
  }

  .review-stats {
    display: inline-flex;
    gap: 4px;
  }

  .stat {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
  }

  .stat.critical {
    background: #fef2f2;
    color: #dc2626;
  }

  .stat.warning {
    background: #fffbeb;
    color: #d97706;
  }

  .stat.suggestion {
    background: #eff6ff;
    color: #2563eb;
  }

  .new-review-btn-sidebar {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0.5rem 0.75rem;
    margin-top: 0.375rem;
    background: var(--gray-50);
    border: 1px dashed var(--gray-300);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-500);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .new-review-btn-sidebar:hover {
    background: var(--gray-100);
    border-color: var(--gray-400);
    color: var(--gray-700);
  }

  .new-review-btn-sidebar svg {
    width: 14px;
    height: 14px;
  }
</style>
