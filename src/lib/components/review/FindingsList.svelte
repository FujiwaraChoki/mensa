<script lang="ts">
  import { reviewStore } from '$lib/stores/review.svelte';
  import type { SeverityFilter } from '$lib/types/review';
  import FindingCard from './FindingCard.svelte';

  interface Props {
    onaskClaude?: (context: string) => void;
  }

  let { onaskClaude }: Props = $props();

  const findings = $derived(reviewStore.filteredFindings());
  const filter = $derived(reviewStore.findingFilter);
  const currentReview = $derived(reviewStore.currentReview);

  // Sort options
  type SortBy = 'severity' | 'file';
  let sortBy = $state<SortBy>('severity');

  const severityOrder = { critical: 0, warning: 1, suggestion: 2, nitpick: 3 };

  const sortedFindings = $derived(() => {
    const toSort = [...findings];

    if (sortBy === 'severity') {
      toSort.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    } else {
      toSort.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.lineStart - b.lineStart);
    }

    return toSort;
  });

  function setFilter(newFilter: SeverityFilter) {
    reviewStore.setFindingFilter(newFilter);
  }

  // Display limits
  let displayLimit = $state(20);

  function loadMore() {
    displayLimit += 20;
  }
</script>

<div class="findings-list">
  <div class="list-controls">
    <div class="filter-group">
      <label>Filter:</label>
      <select value={filter} onchange={(e) => setFilter(e.currentTarget.value as SeverityFilter)}>
        <option value="all">All ({currentReview?.stats.total ?? 0})</option>
        <option value="critical-only">Critical Only ({currentReview?.stats.critical ?? 0})</option>
        <option value="no-nitpicks">No Nitpicks ({(currentReview?.stats.total ?? 0) - (currentReview?.stats.nitpicks ?? 0)})</option>
      </select>
    </div>

    <div class="sort-group">
      <label>Sort:</label>
      <select bind:value={sortBy}>
        <option value="severity">By Severity</option>
        <option value="file">By File</option>
      </select>
    </div>
  </div>

  <div class="findings-container">
    {#if sortedFindings().length === 0}
      <div class="empty-state">
        <span class="empty-icon">&#x2713;</span>
        <span class="empty-text">No findings to display</span>
      </div>
    {:else}
      {#each sortedFindings().slice(0, displayLimit) as finding (finding.id)}
        <FindingCard {finding} {onaskClaude} />
      {/each}

      {#if sortedFindings().length > displayLimit}
        <button class="load-more-btn" onclick={loadMore}>
          Load More ({sortedFindings().length - displayLimit} remaining)
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .findings-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .list-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
  }

  .filter-group, .sort-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-group label, .sort-group label {
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-500);
  }

  .filter-group select, .sort-group select {
    padding: 0.375rem 0.5rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--off-black);
    cursor: pointer;
  }

  .findings-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    gap: 0.5rem;
  }

  .empty-icon {
    font-size: 2rem;
    color: #22c55e;
  }

  .empty-text {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-500);
  }

  .load-more-btn {
    padding: 0.75rem;
    background: var(--gray-100);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .load-more-btn:hover {
    background: var(--gray-200);
  }
</style>
