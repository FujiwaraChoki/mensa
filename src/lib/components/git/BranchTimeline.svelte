<script lang="ts">
  import { slide } from 'svelte/transition';
  import { gitStore } from '$lib/stores/git.svelte';
  import type { GitCommit } from '$lib/types/git';
  import { getDiffBetweenCommits } from '$lib/services/git';

  interface Props {
    workingDir: string;
    commits?: GitCommit[];
    limit?: number;
  }

  let { workingDir, commits, limit = 20 }: Props = $props();

  let expandedCommit = $state<string | null>(null);
  let commitDiffs = $state<Record<string, string>>({});
  let loadingDiff = $state<string | null>(null);

  // Use provided commits or fetch from store
  $effect(() => {
    if (!commits && workingDir) {
      gitStore.loadCommitLog(workingDir, limit);
    }
  });

  const displayCommits = $derived(commits || gitStore.commitLog.slice(0, limit));

  async function toggleCommit(commit: GitCommit) {
    if (expandedCommit === commit.hash) {
      expandedCommit = null;
      return;
    }

    expandedCommit = commit.hash;

    // Load diff if not already loaded
    if (!commitDiffs[commit.hash]) {
      loadingDiff = commit.hash;
      try {
        const diff = await getDiffBetweenCommits(workingDir, `${commit.hash}^`, commit.hash);
        commitDiffs = { ...commitDiffs, [commit.hash]: diff };
      } catch (e) {
        console.error('[BranchTimeline] Failed to load diff:', e);
        commitDiffs = { ...commitDiffs, [commit.hash]: 'Failed to load diff' };
      } finally {
        loadingDiff = null;
      }
    }
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return diffMins <= 1 ? 'just now' : `${diffMins}m ago`;
      }
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  function getShortHash(hash: string): string {
    return hash.substring(0, 7);
  }

  function getFirstLine(message: string): string {
    return message.split('\n')[0];
  }

  function isClaudeCommit(commit: GitCommit): boolean {
    // Check if commit was made by Claude (co-authored or authored)
    return commit.message.toLowerCase().includes('claude') ||
           commit.author.toLowerCase().includes('claude');
  }
</script>

<div class="timeline">
  {#if displayCommits.length === 0}
    <div class="empty">
      <span>No commits to display</span>
    </div>
  {:else}
    {#each displayCommits as commit, index (commit.hash)}
      <div class="commit-item" class:expanded={expandedCommit === commit.hash}>
        <div class="timeline-line">
          <div class="dot" class:first={index === 0} class:claude={isClaudeCommit(commit)}>
            {#if isClaudeCommit(commit)}
              <span class="claude-badge">✨</span>
            {/if}
          </div>
          {#if index < displayCommits.length - 1}
            <div class="line"></div>
          {/if}
        </div>

        <button class="commit-content" onclick={() => toggleCommit(commit)}>
          <div class="commit-header">
            <span class="commit-hash">{getShortHash(commit.hash)}</span>
            <span class="commit-time">{formatDate(commit.timestamp)}</span>
          </div>
          <div class="commit-message">{getFirstLine(commit.message)}</div>
          <div class="commit-author">{commit.author}</div>
        </button>

        {#if expandedCommit === commit.hash}
          <div class="commit-details" transition:slide={{ duration: 150 }}>
            {#if commit.message.includes('\n')}
              <div class="full-message">
                <pre>{commit.message}</pre>
              </div>
            {/if}

            {#if loadingDiff === commit.hash}
              <div class="loading-diff">
                <span class="spinner"></span>
                Loading diff...
              </div>
            {:else if commitDiffs[commit.hash]}
              <div class="commit-diff">
                <pre>{commitDiffs[commit.hash]}</pre>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--gray-400);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
  }

  .commit-item {
    display: flex;
    gap: 0.75rem;
    position: relative;
  }

  .timeline-line {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 20px;
    flex-shrink: 0;
  }

  .dot {
    width: 10px;
    height: 10px;
    background: var(--gray-300);
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    transition: all var(--transition-fast);
  }

  .dot.first {
    background: var(--off-black);
    width: 12px;
    height: 12px;
  }

  .dot.claude {
    background: linear-gradient(135deg, #f0f9ff, #fdf4ff);
    border: 2px solid #a78bfa;
    width: 14px;
    height: 14px;
  }

  .claude-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    font-size: 8px;
  }

  .line {
    flex: 1;
    width: 2px;
    background: var(--gray-200);
    min-height: 24px;
  }

  .commit-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
    margin-bottom: 0.5rem;
  }

  .commit-content:hover {
    background: var(--gray-50);
  }

  .commit-item.expanded .commit-content {
    background: var(--gray-100);
  }

  .commit-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .commit-hash {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
    padding: 0.125rem 0.375rem;
    background: var(--gray-100);
    border-radius: var(--radius-sm);
  }

  .commit-time {
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-400);
  }

  .commit-message {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .commit-author {
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-500);
  }

  .commit-details {
    margin-left: 20px;
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
    border: 1px solid var(--gray-200);
  }

  .full-message {
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--gray-200);
  }

  .full-message pre {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--gray-700);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    line-height: 1.5;
  }

  .loading-diff {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    color: var(--gray-500);
    font-family: var(--font-sans);
    font-size: 12px;
  }

  .commit-diff {
    max-height: 300px;
    overflow: auto;
    border-radius: var(--radius-sm);
    background: var(--white);
    border: 1px solid var(--gray-200);
  }

  .commit-diff pre {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-700);
    white-space: pre;
    margin: 0;
    padding: 0.5rem;
    line-height: 1.5;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--gray-300);
    border-top-color: var(--off-black);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
