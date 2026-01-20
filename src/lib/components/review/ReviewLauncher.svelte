<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { fade, fly } from 'svelte/transition';
  import { appConfig } from '$lib/stores/app.svelte';
  import { reviewStore } from '$lib/stores/review.svelte';
  import { performReview, fetchPRInfo } from '$lib/services/review';
  import type { ReviewSource, PRInfo, PRListItem, GitStatus } from '$lib/types';
  import PresetSelector from './PresetSelector.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  // Tab state
  type Tab = 'local' | 'staged' | 'branch' | 'pr' | 'files';
  let activeTab = $state<Tab>('local');

  // Git state
  let gitStatus = $state<GitStatus | null>(null);
  let branches = $state<string[]>([]);
  let loadingGit = $state(true);

  // PR state
  let prUrl = $state('');
  let prInfo = $state<PRInfo | null>(null);
  let loadingPR = $state(false);
  let prError = $state<string | null>(null);
  let prList = $state<PRListItem[]>([]);
  let loadingPRList = $state(false);
  let selectedPR = $state<PRListItem | null>(null);
  let prMode = $state<'list' | 'url'>('list');

  // Branch state
  let baseBranch = $state('main');
  let headBranch = $state('');

  // Review state
  let isStarting = $state(false);

  // Load git status on mount
  $effect(() => {
    loadGitStatus();
  });

  async function loadGitStatus() {
    const workingDir = appConfig.workspace?.path || '.';
    try {
      [gitStatus, branches] = await Promise.all([
        invoke<GitStatus>('git_status', { workingDir }),
        invoke<string[]>('git_list_branches', { workingDir }),
      ]);
      headBranch = gitStatus?.branch || '';
    } catch (e) {
      console.error('[review] Failed to load git status:', e);
    } finally {
      loadingGit = false;
    }
  }

  async function loadPRList() {
    const workingDir = appConfig.workspace?.path || '.';
    loadingPRList = true;
    prError = null;

    try {
      prList = await invoke<PRListItem[]>('list_prs', { workingDir, state: 'open' });
    } catch (e) {
      prError = e instanceof Error ? e.message : 'Failed to load PRs. Make sure gh CLI is installed and authenticated.';
      prList = [];
    } finally {
      loadingPRList = false;
    }
  }

  async function loadPRInfo() {
    if (!prUrl.trim()) return;

    loadingPR = true;
    prError = null;

    try {
      prInfo = await fetchPRInfo(prUrl);
    } catch (e) {
      prError = e instanceof Error ? e.message : 'Failed to load PR';
      prInfo = null;
    } finally {
      loadingPR = false;
    }
  }

  function selectPR(pr: PRListItem) {
    selectedPR = pr;
    prUrl = pr.url;
    // Fetch full PR info
    loadPRInfo();
  }

  // Load PR list when switching to PR tab
  $effect(() => {
    if (activeTab === 'pr' && prList.length === 0 && !loadingPRList) {
      loadPRList();
    }
  });

  function getSource(): ReviewSource | null {
    switch (activeTab) {
      case 'local':
        return { type: 'local-changes' };
      case 'staged':
        return { type: 'staged' };
      case 'branch':
        return { type: 'branch', baseBranch, headBranch };
      case 'pr':
        return prUrl.trim() ? { type: 'pr', url: prUrl } : null;
      default:
        return null;
    }
  }

  function canStartReview(): boolean {
    if (loadingGit) return false;

    switch (activeTab) {
      case 'local':
        return (gitStatus?.modified.length ?? 0) > 0 || (gitStatus?.untracked.length ?? 0) > 0;
      case 'staged':
        return (gitStatus?.staged.length ?? 0) > 0;
      case 'branch':
        return baseBranch !== headBranch;
      case 'pr':
        return selectedPR !== null || prUrl.trim().length > 0;
      default:
        return false;
    }
  }

  async function startReview() {
    const source = getSource();
    if (!source) return;

    isStarting = true;
    reviewStore.setSource(source);

    try {
      const preset = reviewStore.selectedPreset;
      await performReview(source, preset, prInfo || undefined);
      onclose();
    } catch (e) {
      console.error('[review] Review failed:', e);
    } finally {
      isStarting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }

  // Computed values
  const localChangesCount = $derived(
    (gitStatus?.modified.length ?? 0) + (gitStatus?.untracked.length ?? 0) + (gitStatus?.deleted.length ?? 0)
  );
  const stagedCount = $derived(gitStatus?.staged.length ?? 0);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="launcher-backdrop" onclick={onclose} transition:fade={{ duration: 150 }}>
  <div
    class="launcher-modal"
    onclick={(e) => e.stopPropagation()}
    transition:fly={{ y: 20, duration: 200 }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="launcher-title"
  >
    <header class="launcher-header">
      <h2 id="launcher-title">Start Code Review</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>

    <div class="launcher-content">
      <section class="source-section">
        <h3>What to Review</h3>

        <div class="tabs">
          <button
            class="tab"
            class:active={activeTab === 'local'}
            onclick={() => activeTab = 'local'}
          >
            Local Changes
            {#if localChangesCount > 0}
              <span class="badge">{localChangesCount}</span>
            {/if}
          </button>
          <button
            class="tab"
            class:active={activeTab === 'staged'}
            onclick={() => activeTab = 'staged'}
          >
            Staged
            {#if stagedCount > 0}
              <span class="badge">{stagedCount}</span>
            {/if}
          </button>
          <button
            class="tab"
            class:active={activeTab === 'branch'}
            onclick={() => activeTab = 'branch'}
          >
            Branch
          </button>
          <button
            class="tab"
            class:active={activeTab === 'pr'}
            onclick={() => activeTab = 'pr'}
          >
            Pull Request
          </button>
        </div>

        <div class="tab-content">
          {#if activeTab === 'local'}
            <div class="source-info">
              {#if loadingGit}
                <span class="loading">Loading...</span>
              {:else if localChangesCount === 0}
                <span class="empty">No local changes</span>
              {:else}
                <span class="count">{localChangesCount} files with changes</span>
                <ul class="file-list">
                  {#each [...(gitStatus?.modified ?? []), ...(gitStatus?.untracked ?? [])].slice(0, 5) as file}
                    <li class="file-item">
                      <span class="file-status" class:modified={file.status === 'modified'} class:untracked={file.status === 'untracked'}>
                        {file.status === 'modified' ? 'M' : '?'}
                      </span>
                      <span class="file-path">{file.path}</span>
                    </li>
                  {/each}
                  {#if localChangesCount > 5}
                    <li class="file-item more">+{localChangesCount - 5} more</li>
                  {/if}
                </ul>
              {/if}
            </div>
          {:else if activeTab === 'staged'}
            <div class="source-info">
              {#if loadingGit}
                <span class="loading">Loading...</span>
              {:else if stagedCount === 0}
                <span class="empty">No staged changes</span>
              {:else}
                <span class="count">{stagedCount} files staged</span>
                <ul class="file-list">
                  {#each (gitStatus?.staged ?? []).slice(0, 5) as file}
                    <li class="file-item">
                      <span class="file-status staged">S</span>
                      <span class="file-path">{file.path}</span>
                    </li>
                  {/each}
                  {#if stagedCount > 5}
                    <li class="file-item more">+{stagedCount - 5} more</li>
                  {/if}
                </ul>
              {/if}
            </div>
          {:else if activeTab === 'branch'}
            <div class="branch-selectors">
              <div class="branch-field">
                <label for="base-branch">Base Branch</label>
                <select id="base-branch" bind:value={baseBranch}>
                  {#each branches as branch}
                    <option value={branch}>{branch}</option>
                  {/each}
                </select>
              </div>
              <span class="branch-arrow">...</span>
              <div class="branch-field">
                <label for="head-branch">Head Branch</label>
                <select id="head-branch" bind:value={headBranch}>
                  {#each branches as branch}
                    <option value={branch}>{branch}</option>
                  {/each}
                </select>
              </div>
            </div>
            {#if baseBranch === headBranch}
              <span class="warning">Select different branches to compare</span>
            {/if}
          {:else if activeTab === 'pr'}
            <div class="pr-section">
              <div class="pr-mode-toggle">
                <button
                  class="mode-btn"
                  class:active={prMode === 'list'}
                  onclick={() => prMode = 'list'}
                >
                  From Repository
                </button>
                <button
                  class="mode-btn"
                  class:active={prMode === 'url'}
                  onclick={() => prMode = 'url'}
                >
                  Enter URL
                </button>
              </div>

              {#if prMode === 'list'}
                <div class="pr-list-container">
                  {#if loadingPRList}
                    <div class="pr-loading">
                      <span class="spinner"></span>
                      <span>Loading pull requests...</span>
                    </div>
                  {:else if prError}
                    <div class="pr-error">
                      <span class="error">{prError}</span>
                      <button class="retry-btn" onclick={loadPRList}>Retry</button>
                    </div>
                  {:else if prList.length === 0}
                    <div class="pr-empty">
                      <span>No open pull requests found</span>
                      <button class="mode-switch" onclick={() => prMode = 'url'}>
                        Enter URL manually
                      </button>
                    </div>
                  {:else}
                    <ul class="pr-list">
                      {#each prList as pr (pr.number)}
                        <li>
                          <button
                            class="pr-item"
                            class:selected={selectedPR?.number === pr.number}
                            onclick={() => selectPR(pr)}
                          >
                            <div class="pr-item-header">
                              <span class="pr-number">#{pr.number}</span>
                              <span class="pr-title">{pr.title}</span>
                              {#if pr.isDraft}
                                <span class="pr-draft">Draft</span>
                              {/if}
                            </div>
                            <div class="pr-item-meta">
                              <span class="pr-author">{pr.author}</span>
                              <span class="pr-branches">{pr.headRefName} → {pr.baseRefName}</span>
                            </div>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}

                  {#if selectedPR && prInfo}
                    <div class="pr-info selected-pr-info">
                      <strong>{prInfo.title}</strong>
                      <span class="pr-meta">
                        {prInfo.author} · {prInfo.headBranch} → {prInfo.baseBranch}
                      </span>
                      <span class="pr-stats">
                        +{prInfo.additions} -{prInfo.deletions} · {prInfo.commits} commits
                      </span>
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="pr-input">
                  <label for="pr-url">Pull Request URL</label>
                  <div class="pr-input-row">
                    <input
                      id="pr-url"
                      type="url"
                      placeholder="https://github.com/owner/repo/pull/123"
                      bind:value={prUrl}
                      onblur={loadPRInfo}
                    />
                    <button
                      class="load-btn"
                      onclick={loadPRInfo}
                      disabled={loadingPR || !prUrl.trim()}
                    >
                      {loadingPR ? 'Loading...' : 'Load'}
                    </button>
                  </div>
                  {#if prError && prMode === 'url'}
                    <span class="error">{prError}</span>
                  {/if}
                  {#if prInfo}
                    <div class="pr-info">
                      <strong>{prInfo.title}</strong>
                      <span class="pr-meta">
                        {prInfo.author} · {prInfo.headBranch} → {prInfo.baseBranch}
                      </span>
                      <span class="pr-stats">
                        +{prInfo.additions} -{prInfo.deletions} · {prInfo.commits} commits
                      </span>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </section>

      <section class="preset-section">
        <h3>Review Preset</h3>
        <PresetSelector />
      </section>
    </div>

    <footer class="launcher-footer">
      <button class="cancel-btn" onclick={onclose}>Cancel</button>
      <button
        class="start-btn"
        onclick={startReview}
        disabled={!canStartReview() || isStarting}
      >
        {#if isStarting}
          <span class="spinner"></span>
          Starting...
        {:else}
          Start Review
        {/if}
      </button>
    </footer>
  </div>
</div>

<style>
  .launcher-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .launcher-modal {
    width: 90%;
    max-width: 640px;
    max-height: 85vh;
    background: var(--white);
    border-radius: var(--radius-lg);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .launcher-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--gray-200);
  }

  .launcher-header h2 {
    font-family: var(--font-sans);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--off-black);
    margin: 0;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--gray-500);
    transition: all var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--gray-100);
    color: var(--off-black);
  }

  .close-btn svg {
    width: 20px;
    height: 20px;
  }

  .launcher-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  section h3 {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--off-black);
    margin: 0 0 0.75rem 0;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    background: var(--gray-100);
    padding: 3px;
    border-radius: var(--radius-md);
  }

  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab:hover {
    color: var(--off-black);
  }

  .tab.active {
    background: var(--white);
    color: var(--off-black);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .badge {
    padding: 1px 6px;
    background: var(--gray-200);
    border-radius: 10px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
  }

  .tab.active .badge {
    background: var(--off-black);
    color: var(--white);
  }

  .tab-content {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
    min-height: 100px;
  }

  .source-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .loading, .empty {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-500);
  }

  .count {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .file-list {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0 0;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .file-item.more {
    color: var(--gray-500);
  }

  .file-status {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  }

  .file-status.modified {
    background: #fef3c7;
    color: #d97706;
  }

  .file-status.untracked {
    background: #dcfce7;
    color: #16a34a;
  }

  .file-status.staged {
    background: #dbeafe;
    color: #2563eb;
  }

  .file-path {
    color: var(--gray-700);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .branch-selectors {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
  }

  .branch-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .branch-field label {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 500;
    color: var(--gray-500);
  }

  .branch-field select {
    padding: 0.5rem 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--off-black);
  }

  .branch-arrow {
    padding-bottom: 0.5rem;
    color: var(--gray-400);
    font-family: var(--font-mono);
  }

  .warning {
    display: block;
    margin-top: 0.75rem;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: #d97706;
  }

  .pr-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .pr-input label {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 500;
    color: var(--gray-500);
  }

  .pr-input-row {
    display: flex;
    gap: 0.5rem;
  }

  .pr-input input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--off-black);
  }

  .pr-input input:focus {
    outline: none;
    border-color: var(--gray-400);
  }

  .load-btn {
    padding: 0.5rem 1rem;
    background: var(--gray-100);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .load-btn:hover:not(:disabled) {
    background: var(--gray-200);
  }

  .load-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: #dc2626;
  }

  .pr-info {
    padding: 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .pr-info strong {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
  }

  .pr-meta, .pr-stats {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
  }

  .pr-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .pr-mode-toggle {
    display: flex;
    gap: 0.25rem;
    background: var(--white);
    padding: 3px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--gray-200);
  }

  .mode-btn {
    flex: 1;
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-500);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .mode-btn:hover {
    color: var(--gray-700);
  }

  .mode-btn.active {
    background: var(--gray-100);
    color: var(--off-black);
    font-weight: 500;
  }

  .pr-list-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .pr-loading, .pr-empty, .pr-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.5rem;
    text-align: center;
  }

  .pr-loading span, .pr-empty span {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-500);
  }

  .pr-error .error {
    margin-bottom: 0.5rem;
  }

  .retry-btn, .mode-switch {
    padding: 0.375rem 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .retry-btn:hover, .mode-switch:hover {
    background: var(--gray-50);
    border-color: var(--gray-300);
  }

  .pr-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .pr-item {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .pr-item:hover {
    border-color: var(--gray-300);
    background: var(--gray-50);
  }

  .pr-item.selected {
    border-color: var(--off-black);
    background: var(--gray-50);
  }

  .pr-item-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .pr-number {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--gray-500);
  }

  .pr-title {
    flex: 1;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pr-draft {
    padding: 1px 6px;
    background: var(--gray-100);
    border-radius: 10px;
    font-family: var(--font-sans);
    font-size: 10px;
    color: var(--gray-500);
  }

  .pr-item-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .pr-author, .pr-branches {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
  }

  .selected-pr-info {
    margin-top: 0.5rem;
    border-color: var(--off-black);
  }

  .launcher-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--gray-200);
    background: var(--gray-50);
  }

  .cancel-btn {
    padding: 0.625rem 1rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .cancel-btn:hover {
    background: var(--gray-50);
    border-color: var(--gray-300);
  }

  .start-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    background: var(--off-black);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--white);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .start-btn:hover:not(:disabled) {
    background: #333;
  }

  .start-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
