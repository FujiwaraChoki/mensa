<script lang="ts">
  import { slide, fly } from 'svelte/transition';
  import { gitStore } from '$lib/stores/git.svelte';
  import type { GitFile } from '$lib/types/git';
  import GitFileItem from './GitFileItem.svelte';
  import DiffViewer from '../DiffViewer.svelte';

  interface Props {
    workingDir: string;
  }

  let { workingDir }: Props = $props();

  let expandedSections = $state({
    staged: true,
    modified: true,
    untracked: false,
    deleted: true
  });

  $effect(() => {
    if (gitStore.showPanel && workingDir) {
      gitStore.refresh(workingDir);
    }
  });

  function toggleSection(section: keyof typeof expandedSections) {
    expandedSections[section] = !expandedSections[section];
  }

  async function handleSelectFile(file: GitFile, staged: boolean) {
    await gitStore.selectFile(file, workingDir, staged);
  }

  async function handleStageAll() {
    await gitStore.stageAll(workingDir);
  }

  async function handleUnstageAll() {
    await gitStore.unstageAll(workingDir);
  }

  async function handleFetch() {
    await gitStore.fetch(workingDir);
  }

  async function handlePull() {
    await gitStore.pull(workingDir);
  }

  async function handleDiscardSelected() {
    if (gitStore.selectedFile && !gitStore.selectedFileStaged) {
      const confirmed = confirm(`Discard changes to ${gitStore.selectedFile.path}?`);
      if (confirmed) {
        await gitStore.discardFile(workingDir, gitStore.selectedFile.path);
      }
    }
  }

  async function handleStageSelected() {
    if (gitStore.selectedFile && !gitStore.selectedFileStaged) {
      await gitStore.stageFiles(workingDir, [gitStore.selectedFile.path]);
    }
  }

  function handleOpenCommitDialog() {
    gitStore.openCommitDialog();
  }
</script>

{#if gitStore.showPanel}
  <div class="git-panel" transition:fly={{ x: 300, duration: 200 }}>
    <header class="panel-header">
      <div class="header-left">
        <h3>Git Changes</h3>
        {#if gitStore.branchInfo}
          <span class="branch-name">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9"/>
            </svg>
            {gitStore.branchInfo.current}
            {#if gitStore.branchInfo.ahead > 0 || gitStore.branchInfo.behind > 0}
              <span class="sync-status">
                {#if gitStore.branchInfo.ahead > 0}
                  <span class="ahead">↑{gitStore.branchInfo.ahead}</span>
                {/if}
                {#if gitStore.branchInfo.behind > 0}
                  <span class="behind">↓{gitStore.branchInfo.behind}</span>
                {/if}
              </span>
            {/if}
          </span>
        {/if}
      </div>
      <div class="header-actions">
        <button class="icon-btn" onclick={handleFetch} title="Fetch" disabled={gitStore.isLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 0 0-9-9M3 12a9 9 0 0 0 9 9M21 12H3M12 3v18"/>
          </svg>
        </button>
        <button class="icon-btn" onclick={handlePull} title="Pull" disabled={gitStore.isLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3v18M5 16l7 7 7-7"/>
          </svg>
        </button>
        <button class="icon-btn" onclick={() => gitStore.closePanel()} title="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </header>

    {#if gitStore.error}
      <div class="error-banner">
        <span>{gitStore.error}</span>
        <button onclick={() => gitStore.clearError()}>×</button>
      </div>
    {/if}

    <div class="panel-content">
      {#if gitStore.isLoading}
        <div class="loading">
          <span class="spinner"></span>
          Loading...
        </div>
      {:else if gitStore.status}
        <div class="files-section">
          <!-- Staged Changes -->
          {#if gitStore.status.staged.length > 0}
            <div class="section">
              <div class="section-header">
                <button class="section-toggle" onclick={() => toggleSection('staged')}>
                  <span class="section-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:collapsed={!expandedSections.staged}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                    Staged Changes
                    <span class="count">{gitStore.status.staged.length}</span>
                  </span>
                </button>
                <button class="text-btn" onclick={handleUnstageAll}>
                  Unstage All
                </button>
              </div>
              {#if expandedSections.staged}
                <div class="file-list" transition:slide={{ duration: 150 }}>
                  {#each gitStore.status.staged as file (file.path)}
                    <GitFileItem
                      {file}
                      {workingDir}
                      staged={true}
                      onselect={(f) => handleSelectFile(f, true)}
                    />
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Modified Files -->
          {#if gitStore.status.modified.length > 0}
            <div class="section">
              <div class="section-header">
                <button class="section-toggle" onclick={() => toggleSection('modified')}>
                  <span class="section-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:collapsed={!expandedSections.modified}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                    Modified
                    <span class="count">{gitStore.status.modified.length}</span>
                  </span>
                </button>
              </div>
              {#if expandedSections.modified}
                <div class="file-list" transition:slide={{ duration: 150 }}>
                  {#each gitStore.status.modified as file (file.path)}
                    <GitFileItem
                      {file}
                      {workingDir}
                      onselect={(f) => handleSelectFile(f, false)}
                    />
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Deleted Files -->
          {#if gitStore.status.deleted.length > 0}
            <div class="section">
              <div class="section-header">
                <button class="section-toggle" onclick={() => toggleSection('deleted')}>
                  <span class="section-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:collapsed={!expandedSections.deleted}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                    Deleted
                    <span class="count">{gitStore.status.deleted.length}</span>
                  </span>
                </button>
              </div>
              {#if expandedSections.deleted}
                <div class="file-list" transition:slide={{ duration: 150 }}>
                  {#each gitStore.status.deleted as file (file.path)}
                    <GitFileItem
                      {file}
                      {workingDir}
                      onselect={(f) => handleSelectFile(f, false)}
                    />
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Untracked Files -->
          {#if gitStore.status.untracked.length > 0}
            <div class="section">
              <div class="section-header">
                <button class="section-toggle" onclick={() => toggleSection('untracked')}>
                  <span class="section-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:collapsed={!expandedSections.untracked}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                    Untracked
                    <span class="count">{gitStore.status.untracked.length}</span>
                  </span>
                </button>
              </div>
              {#if expandedSections.untracked}
                <div class="file-list" transition:slide={{ duration: 150 }}>
                  {#each gitStore.status.untracked as file (file.path)}
                    <GitFileItem
                      {file}
                      {workingDir}
                      onselect={(f) => handleSelectFile(f, false)}
                    />
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if !gitStore.hasChanges}
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/>
              </svg>
              <span>Working tree clean</span>
            </div>
          {/if}
        </div>

        <!-- Diff Viewer -->
        {#if gitStore.selectedFile && gitStore.currentDiff}
          <div class="diff-section">
            <div class="diff-header">
              <span class="diff-filename">{gitStore.selectedFile.path}</span>
              <div class="diff-actions">
                {#if !gitStore.selectedFileStaged}
                  <button class="action-btn" onclick={handleDiscardSelected}>
                    Discard
                  </button>
                  <button class="action-btn primary" onclick={handleStageSelected}>
                    Stage
                  </button>
                {/if}
              </div>
            </div>
            <DiffViewer diff={gitStore.currentDiff} />
          </div>
        {/if}

        <!-- Action Bar -->
        {#if gitStore.hasChanges}
          <div class="action-bar">
            <button class="stage-all-btn" onclick={handleStageAll}>
              Stage All
            </button>
            {#if gitStore.hasStagedChanges}
              <button class="commit-btn" onclick={handleOpenCommitDialog}>
                Commit ({gitStore.status.staged.length})
              </button>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="empty-state">
          <span>Not a git repository</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .git-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 380px;
    max-width: 100%;
    background: var(--white);
    border-left: 1px solid var(--gray-200);
    display: flex;
    flex-direction: column;
    z-index: 100;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--gray-200);
    background: var(--gray-50);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .panel-header h3 {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--off-black);
    margin: 0;
  }

  .branch-name {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--gray-600);
    padding: 0.25rem 0.5rem;
    background: var(--gray-200);
    border-radius: var(--radius-sm);
  }

  .branch-name svg {
    width: 14px;
    height: 14px;
  }

  .sync-status {
    display: flex;
    gap: 0.25rem;
    margin-left: 0.25rem;
  }

  .ahead {
    color: var(--color-added);
  }

  .behind {
    color: var(--color-deleted);
  }

  .header-actions {
    display: flex;
    gap: 0.375rem;
  }

  .icon-btn {
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

  .icon-btn:hover:not(:disabled) {
    background: var(--gray-200);
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .icon-btn svg {
    width: 16px;
    height: 16px;
    color: var(--gray-600);
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: #fef2f2;
    border-bottom: 1px solid #fecaca;
    font-family: var(--font-sans);
    font-size: 12px;
    color: #dc2626;
  }

  .error-banner button {
    background: none;
    border: none;
    color: #dc2626;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--gray-500);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--gray-300);
    border-top-color: var(--off-black);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .files-section {
    flex: 1;
    overflow-y: auto;
  }

  .section {
    border-bottom: 1px solid var(--gray-100);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.5rem 1rem;
    background: transparent;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    flex: 1;
    padding: 0.25rem 0;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .section-toggle:hover {
    opacity: 0.8;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    color: var(--gray-600);
    text-transform: uppercase;
  }

  .section-title svg {
    width: 14px;
    height: 14px;
    transition: transform var(--transition-fast);
  }

  .section-title svg.collapsed {
    transform: rotate(0deg);
  }

  .section-title svg:not(.collapsed) {
    transform: rotate(90deg);
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 0.375rem;
    background: var(--gray-200);
    border-radius: 9px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--gray-600);
  }

  .text-btn {
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-500);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    transition: color var(--transition-fast);
  }

  .text-btn:hover {
    color: var(--off-black);
  }

  .file-list {
    padding: 0.25rem 0.5rem 0.5rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 3rem 1rem;
    color: var(--gray-400);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
  }

  .empty-state svg {
    width: 32px;
    height: 32px;
  }

  .diff-section {
    flex: 1;
    min-height: 200px;
    border-top: 1px solid var(--gray-200);
    display: flex;
    flex-direction: column;
  }

  .diff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--gray-50);
    border-bottom: 1px solid var(--gray-200);
  }

  .diff-filename {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--off-black);
  }

  .diff-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.375rem 0.75rem;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    background: var(--gray-100);
    border: 1px solid var(--gray-300);
    color: var(--gray-700);
  }

  .action-btn:hover {
    background: var(--gray-200);
  }

  .action-btn.primary {
    background: var(--off-black);
    border-color: var(--off-black);
    color: var(--white);
  }

  .action-btn.primary:hover {
    opacity: 0.9;
  }

  .action-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--gray-200);
    background: var(--gray-50);
  }

  .stage-all-btn {
    flex: 1;
    padding: 0.625rem 1rem;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .stage-all-btn:hover {
    background: var(--gray-100);
  }

  .commit-btn {
    flex: 1;
    padding: 0.625rem 1rem;
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

  .commit-btn:hover {
    opacity: 0.9;
  }
</style>
