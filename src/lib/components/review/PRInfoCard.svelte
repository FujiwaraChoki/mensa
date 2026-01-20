<script lang="ts">
  import type { PRInfo } from '$lib/types/review';

  interface Props {
    prInfo: PRInfo;
    prUrl: string;
  }

  let { prInfo, prUrl }: Props = $props();

  function openInGitHub() {
    window.open(prUrl, '_blank', 'noopener,noreferrer');
  }

  const stateColors: Record<string, { bg: string; text: string }> = {
    open: { bg: '#dcfce7', text: '#16a34a' },
    closed: { bg: '#fef2f2', text: '#dc2626' },
    merged: { bg: '#f3e8ff', text: '#9333ea' },
  };

  const colors = $derived(stateColors[prInfo.state] || stateColors.open);
</script>

<div class="pr-info-card">
  <div class="pr-header">
    <div class="pr-state" style="background: {colors.bg}; color: {colors.text};">
      {prInfo.state.toUpperCase()}
    </div>
    <button class="github-link" onclick={openInGitHub}>
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
      View on GitHub
    </button>
  </div>

  <h3 class="pr-title">{prInfo.title}</h3>

  <div class="pr-meta">
    <span class="meta-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
      {prInfo.author}
    </span>
    <span class="meta-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
      {prInfo.headBranch} → {prInfo.baseBranch}
    </span>
  </div>

  <div class="pr-stats">
    <span class="stat additions">+{prInfo.additions}</span>
    <span class="stat deletions">-{prInfo.deletions}</span>
    <span class="stat">{prInfo.commits} commits</span>
  </div>

  {#if prInfo.body}
    <div class="pr-description">
      <p>{prInfo.body.length > 200 ? prInfo.body.slice(0, 200) + '...' : prInfo.body}</p>
    </div>
  {/if}
</div>

<style>
  .pr-info-card {
    padding: 1rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .pr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pr-state {
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
  }

  .github-link {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .github-link:hover {
    background: var(--gray-50);
    border-color: var(--gray-300);
  }

  .github-link svg {
    width: 14px;
    height: 14px;
  }

  .pr-title {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--off-black);
    margin: 0;
    line-height: 1.4;
  }

  .pr-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-600);
  }

  .meta-item svg {
    width: 14px;
    height: 14px;
    color: var(--gray-400);
  }

  .pr-stats {
    display: flex;
    gap: 0.75rem;
  }

  .stat {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--gray-600);
  }

  .stat.additions {
    color: #16a34a;
  }

  .stat.deletions {
    color: #dc2626;
  }

  .pr-description {
    padding-top: 0.5rem;
    border-top: 1px solid var(--gray-100);
  }

  .pr-description p {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-600);
    line-height: 1.5;
    margin: 0;
  }
</style>
