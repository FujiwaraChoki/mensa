<script lang="ts">
  import { fly } from 'svelte/transition';
  import { reviewStore } from '$lib/stores/review.svelte';
  import { postReviewToGitHub, generateGitHubSummary } from '$lib/services/review';
  import ReviewProgress from './ReviewProgress.svelte';
  import ReviewSummary from './ReviewSummary.svelte';
  import FindingsList from './FindingsList.svelte';
  import PRInfoCard from './PRInfoCard.svelte';

  interface Props {
    onaskClaude?: (context: string) => void;
    onclose: () => void;
  }

  let { onaskClaude, onclose }: Props = $props();

  const isReviewing = $derived(reviewStore.isReviewing);
  const currentReview = $derived(reviewStore.currentReview);
  const error = $derived(reviewStore.error);

  // PR posting state
  let isPostingToGitHub = $state(false);
  let postError = $state<string | null>(null);
  let postSuccess = $state(false);

  // Check if this is a PR review
  const isPRReview = $derived(currentReview?.source.type === 'pr');
  const prUrl = $derived(isPRReview ? (currentReview?.source as { type: 'pr'; url: string }).url : null);

  function handleClose() {
    reviewStore.closeReviewPanel();
    onclose();
  }

  async function handlePostToGitHub(verdict: 'approve' | 'request-changes' | 'comment') {
    if (!currentReview || !prUrl) return;

    isPostingToGitHub = true;
    postError = null;

    try {
      const summary = generateGitHubSummary(currentReview);
      await postReviewToGitHub(prUrl, verdict, summary);
      postSuccess = true;
    } catch (e) {
      postError = e instanceof Error ? e.message : 'Failed to post review';
    } finally {
      isPostingToGitHub = false;
    }
  }

  function handleNewReview() {
    reviewStore.clearCurrentReview();
    reviewStore.openReviewLauncher();
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<aside class="review-panel" transition:fly={{ x: 400, duration: 200 }}>
  <header class="panel-header">
    <h2>Code Review</h2>
    <button class="close-btn" onclick={handleClose} aria-label="Close panel">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </header>

  <div class="panel-content">
    {#if isReviewing}
      <ReviewProgress oncancel={() => reviewStore.reset()} />
    {:else if error}
      <div class="error-state">
        <div class="error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p class="error-message">{error}</p>
        <button class="retry-btn" onclick={handleNewReview}>Try Again</button>
      </div>
    {:else if currentReview}
      <div class="review-content">
        {#if isPRReview && currentReview.source.type === 'pr'}
          <!-- PR Info would go here if we had it stored -->
        {/if}

        <ReviewSummary />

        <div class="findings-section">
          <h3>Findings</h3>
          <FindingsList {onaskClaude} />
        </div>

        {#if isPRReview && prUrl && !postSuccess}
          <div class="github-actions">
            <h3>Post to GitHub</h3>
            {#if postError}
              <p class="post-error">{postError}</p>
            {/if}
            <div class="github-buttons">
              <button
                class="github-btn approve"
                onclick={() => handlePostToGitHub('approve')}
                disabled={isPostingToGitHub}
              >
                Approve
              </button>
              <button
                class="github-btn comment"
                onclick={() => handlePostToGitHub('comment')}
                disabled={isPostingToGitHub}
              >
                Comment
              </button>
              <button
                class="github-btn request-changes"
                onclick={() => handlePostToGitHub('request-changes')}
                disabled={isPostingToGitHub}
              >
                Request Changes
              </button>
            </div>
          </div>
        {/if}

        {#if postSuccess}
          <div class="post-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Review posted to GitHub!</span>
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <p>No review in progress</p>
        <button class="start-btn" onclick={handleNewReview}>Start New Review</button>
      </div>
    {/if}
  </div>

  <footer class="panel-footer">
    <button class="new-review-btn" onclick={handleNewReview}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      New Review
    </button>
    <span class="shortcut-hint"><kbd>Esc</kbd> to close</span>
  </footer>
</aside>

<style>
  .review-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: 420px;
    height: 100vh;
    background: var(--white);
    border-left: 1px solid var(--gray-200);
    display: flex;
    flex-direction: column;
    z-index: 90;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--gray-200);
    flex-shrink: 0;
  }

  .panel-header h2 {
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

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
  }

  .review-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .findings-section h3, .github-actions h3 {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--off-black);
    margin: 0 0 0.75rem 0;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    gap: 1rem;
    text-align: center;
  }

  .error-icon {
    width: 48px;
    height: 48px;
    color: #dc2626;
  }

  .error-icon svg {
    width: 100%;
    height: 100%;
  }

  .error-message {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: #dc2626;
    margin: 0;
  }

  .retry-btn {
    padding: 0.625rem 1rem;
    background: var(--gray-100);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .retry-btn:hover {
    background: var(--gray-200);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    gap: 1rem;
    text-align: center;
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    color: var(--gray-400);
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state p {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-500);
    margin: 0;
  }

  .start-btn {
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

  .start-btn:hover {
    background: #333;
  }

  .github-actions {
    padding: 1rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
  }

  .post-error {
    font-family: var(--font-sans);
    font-size: 12px;
    color: #dc2626;
    margin: 0 0 0.75rem 0;
  }

  .github-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .github-btn {
    flex: 1;
    padding: 0.5rem;
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .github-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .github-btn.approve {
    background: #dcfce7;
    color: #16a34a;
  }

  .github-btn.approve:hover:not(:disabled) {
    background: #bbf7d0;
  }

  .github-btn.comment {
    background: var(--gray-100);
    color: var(--gray-700);
  }

  .github-btn.comment:hover:not(:disabled) {
    background: var(--gray-200);
  }

  .github-btn.request-changes {
    background: #fef2f2;
    color: #dc2626;
  }

  .github-btn.request-changes:hover:not(:disabled) {
    background: #fecaca;
  }

  .post-success {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #dcfce7;
    border-radius: var(--radius-md);
    color: #16a34a;
  }

  .post-success svg {
    width: 20px;
    height: 20px;
  }

  .post-success span {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--gray-200);
    background: var(--gray-50);
    flex-shrink: 0;
  }

  .new-review-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .new-review-btn:hover {
    background: var(--white);
    border-color: var(--gray-400);
  }

  .new-review-btn svg {
    width: 14px;
    height: 14px;
  }

  .shortcut-hint {
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-500);
  }

  .shortcut-hint kbd {
    padding: 2px 5px;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
  }
</style>
