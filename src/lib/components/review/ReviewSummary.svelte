<script lang="ts">
  import { reviewStore } from '$lib/stores/review.svelte';

  const review = $derived(reviewStore.currentReview);
  const stats = $derived(review?.stats);
</script>

{#if review}
  <div class="review-summary">
    <div class="stats-row">
      <div class="stat critical">
        <span class="stat-value">{stats?.critical ?? 0}</span>
        <span class="stat-label">Critical</span>
      </div>
      <div class="stat warning">
        <span class="stat-value">{stats?.warnings ?? 0}</span>
        <span class="stat-label">Warnings</span>
      </div>
      <div class="stat suggestion">
        <span class="stat-value">{stats?.suggestions ?? 0}</span>
        <span class="stat-label">Suggestions</span>
      </div>
      <div class="stat nitpick">
        <span class="stat-value">{stats?.nitpicks ?? 0}</span>
        <span class="stat-label">Nitpicks</span>
      </div>
    </div>

    <div class="meta-row">
      <span class="meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        {review.filesReviewed.length} files reviewed
      </span>
      <span class="meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
        </svg>
        {review.preset.name}
      </span>
      <span class="meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {review.createdAt.toLocaleTimeString()}
      </span>
    </div>

    {#if review.summary}
      <p class="summary-text">{review.summary}</p>
    {/if}
  </div>
{/if}

<style>
  .review-summary {
    padding: 1rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stats-row {
    display: flex;
    gap: 0.5rem;
  }

  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.625rem;
    background: var(--white);
    border-radius: var(--radius-sm);
    border: 1px solid var(--gray-200);
  }

  .stat-value {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 600;
  }

  .stat-label {
    font-family: var(--font-sans);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--gray-500);
  }

  .stat.critical .stat-value { color: #dc2626; }
  .stat.warning .stat-value { color: #d97706; }
  .stat.suggestion .stat-value { color: #2563eb; }
  .stat.nitpick .stat-value { color: #6b7280; }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-600);
  }

  .meta-item svg {
    width: 14px;
    height: 14px;
    color: var(--gray-400);
  }

  .summary-text {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-700);
    line-height: 1.6;
    margin: 0;
    padding-top: 0.5rem;
    border-top: 1px solid var(--gray-200);
  }
</style>
