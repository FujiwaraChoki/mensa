<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { gitStore } from '$lib/stores/git.svelte';
  import { listBranches, getDiffBetweenCommits, generatePRDescription } from '$lib/services/git';

  interface Props {
    workingDir: string;
    onclose: () => void;
  }

  let { workingDir, onclose }: Props = $props();

  let branches = $state<string[]>([]);
  let baseBranch = $state('main');
  let headBranch = $state('');
  let title = $state('');
  let body = $state('');
  let isDraft = $state(false);
  let isGeneratingDescription = $state(false);
  let error = $state<string | null>(null);

  // Load branches on mount
  $effect(() => {
    if (gitStore.showPRDialog) {
      loadBranches();
      if (gitStore.branchInfo) {
        headBranch = gitStore.branchInfo.current;
      }
    }
  });

  async function loadBranches() {
    try {
      branches = await listBranches(workingDir);
      // Set default base branch
      if (branches.includes('main')) {
        baseBranch = 'main';
      } else if (branches.includes('master')) {
        baseBranch = 'master';
      } else if (branches.length > 0) {
        baseBranch = branches[0];
      }
    } catch (e) {
      console.error('[PRDialog] Failed to load branches:', e);
    }
  }

  async function generateDescription() {
    if (!baseBranch || !headBranch) return;

    isGeneratingDescription = true;
    error = null;

    try {
      const diff = await getDiffBetweenCommits(workingDir, baseBranch, headBranch);
      const description = await generatePRDescription(diff, title, gitStore.commitLog);
      body = description;
    } catch (e) {
      console.error('[PRDialog] Failed to generate description:', e);
      body = '## Summary\n\n- \n\n## Changes\n\n- ';
    } finally {
      isGeneratingDescription = false;
    }
  }

  async function handleCreatePR() {
    if (!title.trim()) {
      error = 'Title is required';
      return;
    }

    // Update store values
    gitStore.prTitle = title;
    gitStore.prBody = body;
    gitStore.prBase = baseBranch;
    gitStore.prHead = headBranch;

    try {
      const url = await gitStore.createPR(workingDir);
      if (url) {
        // Open the PR in browser
        window.open(url, '_blank');
        onclose();
      }
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
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if gitStore.showPRDialog}
  <div class="backdrop" onclick={handleBackdropClick} role="button" tabindex="-1" transition:fade={{ duration: 150 }}>
    <div class="modal" transition:fly={{ y: 10, duration: 150 }}>
      <header class="modal-header">
        <h2>Create Pull Request</h2>
        <button class="close-btn" onclick={onclose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="modal-content">
        {#if !gitStore.ghCliAvailable}
          <div class="warning-message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 9v2m0 4h.01M12 3l9 17H3L12 3z"/>
            </svg>
            <div>
              <strong>GitHub CLI not found</strong>
              <p>Please install and authenticate the GitHub CLI to create pull requests.</p>
              <code>gh auth login</code>
            </div>
          </div>
        {:else}
          {#if error}
            <div class="error-message">
              {error}
            </div>
          {/if}

          <div class="branch-selector">
            <div class="branch-item">
              <label for="base-branch">Base</label>
              <select id="base-branch" bind:value={baseBranch}>
                {#each branches as branch}
                  <option value={branch}>{branch}</option>
                {/each}
              </select>
            </div>
            <div class="branch-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            <div class="branch-item">
              <label for="head-branch">Compare</label>
              <select id="head-branch" bind:value={headBranch}>
                {#each branches as branch}
                  <option value={branch}>{branch}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="pr-title">Title</label>
            <input
              id="pr-title"
              type="text"
              bind:value={title}
              placeholder="Pull request title"
              disabled={gitStore.isCreatingPR}
            />
          </div>

          <div class="form-group">
            <label for="pr-body">
              Description
              {#if isGeneratingDescription}
                <span class="generating">
                  <span class="spinner"></span>
                  Generating...
                </span>
              {/if}
            </label>
            <textarea
              id="pr-body"
              bind:value={body}
              placeholder="Describe the changes in this pull request..."
              rows="10"
              disabled={isGeneratingDescription || gitStore.isCreatingPR}
            ></textarea>
            <button
              class="generate-btn"
              onclick={generateDescription}
              disabled={isGeneratingDescription || gitStore.isCreatingPR || !baseBranch || !headBranch}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/>
              </svg>
              Generate with AI
            </button>
          </div>

          <div class="option-row">
            <label class="checkbox-label">
              <input
                type="checkbox"
                bind:checked={isDraft}
                disabled={gitStore.isCreatingPR}
              />
              <span>Create as draft</span>
            </label>
          </div>
        {/if}
      </div>

      <footer class="modal-footer">
        <button class="cancel-btn" onclick={onclose} disabled={gitStore.isCreatingPR}>
          Cancel
        </button>
        {#if gitStore.ghCliAvailable}
          <button
            class="create-btn"
            onclick={handleCreatePR}
            disabled={!title.trim() || gitStore.isCreatingPR}
          >
            {#if gitStore.isCreatingPR}
              <span class="spinner"></span>
              Creating...
            {:else}
              Create Pull Request
            {/if}
          </button>
        {/if}
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
    max-width: 560px;
    max-height: 85vh;
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
    flex: 1;
  }

  .warning-message {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: var(--radius-md);
  }

  .warning-message svg {
    width: 24px;
    height: 24px;
    color: #f59e0b;
    flex-shrink: 0;
  }

  .warning-message strong {
    display: block;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    margin-bottom: 0.25rem;
  }

  .warning-message p {
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-600);
    margin: 0 0 0.5rem 0;
  }

  .warning-message code {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
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

  .branch-selector {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .branch-item {
    flex: 1;
  }

  .branch-item label {
    display: block;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    color: var(--gray-600);
    margin-bottom: 0.375rem;
  }

  .branch-item select {
    width: 100%;
    padding: 0.625rem 0.875rem;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--off-black);
    cursor: pointer;
  }

  .branch-arrow {
    display: flex;
    align-items: center;
    padding-bottom: 0.5rem;
  }

  .branch-arrow svg {
    width: 20px;
    height: 20px;
    color: var(--gray-400);
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

  input[type="text"] {
    width: 100%;
    padding: 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    transition: border-color var(--transition-fast);
  }

  input[type="text"]:focus {
    outline: none;
    border-color: var(--off-black);
  }

  textarea {
    width: 100%;
    padding: 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: 13px;
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

  .generate-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.5rem;
    padding: 0.5rem 0.875rem;
    background: linear-gradient(135deg, #f0f9ff, #fdf4ff);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    color: var(--gray-700);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .generate-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #e0f2fe, #fae8ff);
    border-color: var(--gray-400);
  }

  .generate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .generate-btn svg {
    width: 14px;
    height: 14px;
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

  .create-btn {
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

  .create-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .create-btn:disabled {
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
