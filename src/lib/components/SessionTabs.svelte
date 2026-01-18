<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { sessionStore, type SessionState } from '$lib/stores/sessions.svelte';

  interface Props {
    oncreate?: () => void;
  }

  let { oncreate }: Props = $props();

  let showConfirmClose = $state<string | null>(null);

  function handleTabClick(sessionId: string) {
    sessionStore.switchToSession(sessionId);
  }

  async function handleCloseClick(e: MouseEvent, session: SessionState) {
    e.stopPropagation();

    // If streaming, show confirmation
    if (session.status === 'streaming') {
      showConfirmClose = session.id;
      return;
    }

    await sessionStore.closeSession(session.id);
  }

  async function handleCancelClick(e: MouseEvent, session: SessionState) {
    e.stopPropagation();
    await sessionStore.cancelSession(session.id);
  }

  async function confirmClose() {
    if (showConfirmClose) {
      await sessionStore.closeSession(showConfirmClose);
      showConfirmClose = null;
    }
  }

  function cancelClose() {
    showConfirmClose = null;
  }

  function handleCreateSession() {
    oncreate?.();
  }

  function getStatusIcon(status: SessionState['status']): string {
    switch (status) {
      case 'streaming': return ''; // Will use animated dot
      case 'error': return '!';
      case 'cancelled': return '×';
      default: return '';
    }
  }
</script>

<div class="session-tabs">
  <div class="tabs-scroll">
    {#each sessionStore.sessionList as session (session.id)}
      <div
        class="tab"
        class:active={session.id === sessionStore.activeSessionId}
        class:streaming={session.status === 'streaming'}
        class:error={session.status === 'error'}
        class:cancelled={session.status === 'cancelled'}
        role="tab"
        tabindex="0"
        aria-selected={session.id === sessionStore.activeSessionId}
        onclick={() => handleTabClick(session.id)}
        onkeydown={(e) => e.key === 'Enter' && handleTabClick(session.id)}
        title={session.title}
        in:fly={{ x: -10, duration: 150 }}
      >
        <span class="tab-title">{session.title}</span>

        {#if session.status === 'streaming'}
          <span class="status-dot streaming-dot" title="Streaming"></span>
        {:else if session.status === 'error'}
          <span class="status-icon error-icon" title="Error">!</span>
        {:else if session.status === 'cancelled'}
          <span class="status-icon cancelled-icon" title="Cancelled">×</span>
        {/if}

        <div class="tab-actions">
          {#if session.status === 'streaming'}
            <button
              class="tab-action cancel-btn"
              onclick={(e) => handleCancelClick(e, session)}
              title="Cancel query"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          {/if}
          <button
            class="tab-action close-btn"
            onclick={(e) => handleCloseClick(e, session)}
            title="Close session"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    {/each}
  </div>

  <button
    class="new-tab-btn"
    onclick={handleCreateSession}
    title="New session (⌘N)"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  </button>
</div>

{#if showConfirmClose}
  <div class="confirm-overlay" transition:fade={{ duration: 100 }}>
    <div class="confirm-dialog" in:fly={{ y: -10, duration: 150 }}>
      <p class="confirm-title">Cancel running query?</p>
      <p class="confirm-message">This session is still streaming. Closing it will cancel the query.</p>
      <div class="confirm-actions">
        <button class="confirm-btn secondary" onclick={cancelClose}>Keep Running</button>
        <button class="confirm-btn danger" onclick={confirmClose}>Cancel & Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .session-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    background: var(--gray-50);
    border-bottom: 1px solid var(--gray-200);
    overflow: hidden;
  }

  .tabs-scroll {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    flex: 1;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .tabs-scroll::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px 6px 12px;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
    max-width: 180px;
    min-width: 100px;
  }

  .tab:hover {
    background: var(--gray-100);
    border-color: var(--gray-300);
  }

  .tab.active {
    background: var(--white);
    border-color: var(--gray-400);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .tab.streaming {
    border-color: var(--blue-400);
  }

  .tab.error {
    border-color: var(--red-400);
  }

  .tab.cancelled {
    border-color: var(--gray-400);
    opacity: 0.7;
  }

  .tab-title {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    color: var(--off-black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .streaming-dot {
    background: var(--blue-500);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  .status-icon {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .error-icon {
    background: var(--red-100);
    color: var(--red-600);
  }

  .cancelled-icon {
    background: var(--gray-200);
    color: var(--gray-500);
  }

  .tab-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .tab:hover .tab-actions {
    opacity: 1;
  }

  .tab-action {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab-action:hover {
    background: var(--gray-200);
  }

  .tab-action svg {
    width: 12px;
    height: 12px;
    color: var(--gray-500);
  }

  .cancel-btn:hover {
    background: var(--red-100);
  }

  .cancel-btn:hover svg {
    color: var(--red-500);
  }

  .close-btn:hover svg {
    color: var(--gray-700);
  }

  .new-tab-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px dashed var(--gray-300);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .new-tab-btn:hover {
    background: var(--gray-100);
    border-color: var(--gray-400);
  }

  .new-tab-btn svg {
    width: 14px;
    height: 14px;
    color: var(--gray-500);
  }

  /* Confirmation dialog */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .confirm-dialog {
    background: var(--white);
    border-radius: var(--radius-lg);
    padding: 20px;
    max-width: 340px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .confirm-title {
    margin: 0 0 8px 0;
    font-family: var(--font-sans);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--off-black);
  }

  .confirm-message {
    margin: 0 0 16px 0;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-600);
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .confirm-btn {
    padding: 8px 16px;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .confirm-btn.secondary {
    background: var(--gray-100);
    color: var(--gray-700);
  }

  .confirm-btn.secondary:hover {
    background: var(--gray-200);
  }

  .confirm-btn.danger {
    background: var(--red-500);
    color: var(--white);
  }

  .confirm-btn.danger:hover {
    background: var(--red-600);
  }
</style>
