<script lang="ts">
  import { reviewStore } from '$lib/stores/review.svelte';

  interface Props {
    oncancel?: () => void;
  }

  let { oncancel }: Props = $props();

  const progress = $derived(reviewStore.progress);
  const percentage = $derived(
    progress?.total ? Math.round((progress.current / progress.total) * 100) : 0
  );
</script>

<div class="progress-container">
  <div class="progress-header">
    <span class="progress-title">Analyzing Code</span>
    {#if oncancel}
      <button class="cancel-btn" onclick={oncancel}>Cancel</button>
    {/if}
  </div>

  <div class="progress-bar-container">
    <div class="progress-bar" style="width: {percentage}%"></div>
  </div>

  <div class="progress-info">
    {#if progress?.currentFile}
      <span class="current-file">{progress.currentFile}</span>
    {/if}
    <div class="progress-stats">
      {#if progress?.findingsCount}
        <span class="findings-count">{progress.findingsCount} findings so far</span>
      {/if}
      {#if progress?.total}
        <span class="file-count">{progress.current}/{progress.total} files</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .progress-container {
    padding: 1.5rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
  }

  .progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .progress-title {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--off-black);
  }

  .cancel-btn {
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

  .cancel-btn:hover {
    background: var(--white);
    border-color: var(--gray-400);
  }

  .progress-bar-container {
    height: 6px;
    background: var(--gray-200);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--off-black);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-info {
    margin-top: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .current-file {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--gray-600);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .progress-stats {
    display: flex;
    gap: 1rem;
  }

  .findings-count, .file-count {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
  }
</style>
