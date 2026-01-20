<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { gitStore } from '$lib/stores/git.svelte';
  import { generateCommitMessage } from '$lib/services/git';

  interface Props {
    workingDir: string;
    onclose: () => void;
  }

  let { workingDir, onclose }: Props = $props();

  let commitMessage = $state('');
  let pushAfterCommit = $state(false);
  let isGenerating = $state(false);
  let error = $state<string | null>(null);

  // Auto-generate commit message on open
  $effect(() => {
    if (gitStore.showCommitDialog && gitStore.currentDiff) {
      generateMessage();
    }
  });

  async function generateMessage() {
    if (!gitStore.currentDiff) return;

    isGenerating = true;
    error = null;

    try {
      const message = await generateCommitMessage(gitStore.currentDiff, undefined, []);
      commitMessage = message;
    } catch (e) {
      console.error('[CommitDialog] Failed to generate message:', e);
      // Fall back to a simple default
      commitMessage = 'Update files';
    } finally {
      isGenerating = false;
    }
  }

  async function handleCommit() {
    if (!commitMessage.trim()) {
      error = 'Commit message is required';
      return;
    }

    try {
      await gitStore.commit(workingDir, commitMessage.trim(), pushAfterCommit);
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
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
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleCommit();
    }
  }

  const stagedCount = $derived(gitStore.status?.staged.length ?? 0);
</script>

<svelte:window on:keydown={handleKeydown} />

{#if gitStore.showCommitDialog}
  <div class="backdrop" onclick={handleBackdropClick} role="button" tabindex="-1" transition:fade={{ duration: 150 }}>
    <div class="modal" transition:fly={{ y: 10, duration: 150 }}>
      <header class="modal-header">
        <h2>Commit Changes</h2>
        <button class="close-btn" onclick={onclose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="modal-content">
        {#if error}
          <div class="error-message">
            {error}
          </div>
        {/if}

        <div class="staged-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/>
          </svg>
          <span>{stagedCount} file{stagedCount !== 1 ? 's' : ''} staged for commit</span>
        </div>

        <div class="form-group">
          <label for="commit-message">
            Commit Message
            {#if isGenerating}
              <span class="generating">
                <span class="spinner"></span>
                Generating...
              </span>
            {/if}
          </label>
          <textarea
            id="commit-message"
            bind:value={commitMessage}
            placeholder="Describe your changes..."
            rows="4"
            disabled={isGenerating || gitStore.isCommitting}
          ></textarea>
          <button
            class="regenerate-btn"
            onclick={generateMessage}
            disabled={isGenerating || gitStore.isCommitting || !gitStore.currentDiff}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-9-9 7 7 0 0 1 7 7l3-3"/>
            </svg>
            Regenerate
          </button>
        </div>

        <div class="commit-format">
          <span class="format-hint">
            Use conventional commits: <code>feat:</code> <code>fix:</code> <code>docs:</code> <code>refactor:</code> <code>test:</code> <code>chore:</code>
          </span>
        </div>

        <div class="option-row">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={pushAfterCommit}
              disabled={gitStore.isCommitting}
            />
            <span>Push after commit</span>
          </label>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="cancel-btn" onclick={onclose} disabled={gitStore.isCommitting}>
          Cancel
        </button>
        <button
          class="commit-btn"
          onclick={handleCommit}
          disabled={!commitMessage.trim() || gitStore.isCommitting || stagedCount === 0}
        >
          {#if gitStore.isCommitting}
            <span class="spinner"></span>
            {pushAfterCommit ? 'Committing & Pushing...' : 'Committing...'}
          {:else}
            {pushAfterCommit ? 'Commit & Push' : 'Commit'}
          {/if}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1001;
  }

  .modal {
    background: var(--white);
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--gray-200);
  }

  .modal-header h2 {
    font-family: var(--font-sans);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 0;
    color: var(--off-black);
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--gray-100);
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
    color: var(--gray-500);
  }

  .modal-content {
    padding: 1.5rem;
    overflow-y: auto;
  }

  .error-message {
    padding: 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: var(--radius-md);
    color: #dc2626;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    margin-bottom: 1rem;
  }

  .staged-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
    margin-bottom: 1rem;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-600);
  }

  .staged-info svg {
    width: 16px;
    height: 16px;
    color: var(--color-added);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
    margin-bottom: 0.5rem;
  }

  .generating {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 400;
    color: var(--gray-500);
    font-size: 12px;
  }

  textarea {
    width: 100%;
    padding: 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--off-black);
    resize: vertical;
    transition: border-color var(--transition-fast);
    line-height: 1.5;
  }

  textarea:focus {
    outline: none;
    border-color: var(--off-black);
  }

  textarea:disabled {
    background: var(--gray-50);
    color: var(--gray-500);
  }

  .regenerate-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .regenerate-btn:hover:not(:disabled) {
    background: var(--gray-50);
    border-color: var(--gray-400);
  }

  .regenerate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .regenerate-btn svg {
    width: 14px;
    height: 14px;
  }

  .commit-format {
    margin-bottom: 1rem;
  }

  .format-hint {
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-500);
  }

  .format-hint code {
    padding: 0.125rem 0.375rem;
    background: var(--gray-100);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 10px;
  }

  .option-row {
    padding: 0.5rem 0;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
  }

  .checkbox-label input {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--gray-200);
  }

  .cancel-btn {
    padding: 0.625rem 1rem;
    background: transparent;
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--gray-100);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .commit-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 1.25rem;
    background: var(--off-black);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--white);
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .commit-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .commit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--gray-300);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
