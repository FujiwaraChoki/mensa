<script lang="ts">
  import { reviewStore } from '$lib/stores/review.svelte';
  import { applyFix } from '$lib/services/review';
  import type { ReviewFinding } from '$lib/types/review';

  interface Props {
    finding: ReviewFinding;
    onaskClaude?: (context: string) => void;
  }

  let { finding, onaskClaude }: Props = $props();

  const isExpanded = $derived(reviewStore.expandedFindingId === finding.id);
  let isApplyingFix = $state(false);

  const severityColors: Record<string, { bg: string; text: string; border: string }> = {
    critical: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
    warning: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
    suggestion: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
    nitpick: { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
  };

  const severityIcons: Record<string, string> = {
    critical: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    warning: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
    suggestion: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
    nitpick: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
  };

  function toggleExpand() {
    reviewStore.expandFinding(isExpanded ? null : finding.id);
  }

  function handleDismiss() {
    reviewStore.updateFindingStatus(finding.id, 'dismissed');
  }

  function handleWontFix() {
    reviewStore.updateFindingStatus(finding.id, 'wont-fix');
  }

  async function handleApplyFix() {
    if (!finding.suggestedFix) return;

    isApplyingFix = true;
    try {
      await applyFix(finding);
    } catch (e) {
      console.error('[review] Failed to apply fix:', e);
    } finally {
      isApplyingFix = false;
    }
  }

  function handleAskClaude() {
    const context = `Review finding: ${finding.title}

File: ${finding.filePath}:${finding.lineStart}
Severity: ${finding.severity}
Category: ${finding.category}

${finding.description}

Code:
\`\`\`
${finding.codeSnippet}
\`\`\``;

    onaskClaude?.(context);
  }

  const colors = $derived(severityColors[finding.severity] || severityColors.suggestion);
  const icon = $derived(severityIcons[finding.severity] || severityIcons.suggestion);
</script>

<div
  class="finding-card"
  class:expanded={isExpanded}
  class:resolved={finding.status !== 'open'}
  style="--severity-bg: {colors.bg}; --severity-text: {colors.text}; --severity-border: {colors.border};"
>
  <button class="finding-header" onclick={toggleExpand}>
    <div class="severity-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d={icon} />
      </svg>
    </div>
    <div class="finding-info">
      <span class="finding-title">{finding.title}</span>
      <span class="finding-location">
        {finding.filePath}:{finding.lineStart}
        {#if finding.lineEnd !== finding.lineStart}
          -{finding.lineEnd}
        {/if}
      </span>
    </div>
    <div class="finding-badges">
      <span class="severity-badge">{finding.severity}</span>
      <span class="category-badge">{finding.category}</span>
    </div>
    <svg class="expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  </button>

  {#if isExpanded}
    <div class="finding-content">
      <p class="finding-description">{finding.description}</p>

      {#if finding.codeSnippet}
        <div class="code-section">
          <span class="section-label">Code</span>
          <pre class="code-snippet">{finding.codeSnippet}</pre>
        </div>
      {/if}

      {#if finding.suggestedFix}
        <div class="fix-section">
          <span class="section-label">Suggested Fix</span>
          <p class="fix-description">{finding.suggestedFix.description}</p>
          <pre class="fix-code">{finding.suggestedFix.code}</pre>
        </div>
      {/if}

      {#if finding.references && finding.references.length > 0}
        <div class="references-section">
          <span class="section-label">References</span>
          <ul class="references-list">
            {#each finding.references as ref}
              <li><a href={ref} target="_blank" rel="noopener noreferrer">{ref}</a></li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="finding-actions">
        {#if finding.suggestedFix && finding.status === 'open'}
          <button
            class="action-btn primary"
            onclick={handleApplyFix}
            disabled={isApplyingFix}
          >
            {isApplyingFix ? 'Applying...' : 'Apply Fix'}
          </button>
        {/if}
        <button class="action-btn" onclick={handleAskClaude}>
          Ask Claude
        </button>
        {#if finding.status === 'open'}
          <button class="action-btn" onclick={handleDismiss}>
            Dismiss
          </button>
          <button class="action-btn" onclick={handleWontFix}>
            Won't Fix
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .finding-card {
    background: var(--white);
    border: 1px solid var(--severity-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: all var(--transition-fast);
  }

  .finding-card:hover {
    border-color: var(--gray-300);
  }

  .finding-card.resolved {
    opacity: 0.6;
  }

  .finding-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem;
    background: var(--severity-bg);
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .severity-icon {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--severity-text);
  }

  .severity-icon svg {
    width: 20px;
    height: 20px;
  }

  .finding-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .finding-title {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .finding-location {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
  }

  .finding-badges {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .severity-badge, .category-badge {
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .severity-badge {
    background: var(--severity-text);
    color: var(--white);
  }

  .category-badge {
    background: var(--gray-200);
    color: var(--gray-600);
  }

  .expand-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    color: var(--gray-400);
    transition: transform var(--transition-fast);
  }

  .finding-card.expanded .expand-icon {
    transform: rotate(180deg);
  }

  .finding-content {
    padding: 1rem;
    border-top: 1px solid var(--gray-100);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .finding-description {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-700);
    line-height: 1.6;
    margin: 0;
  }

  .section-label {
    display: block;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--gray-500);
    margin-bottom: 0.5rem;
  }

  .code-section, .fix-section, .references-section {
    display: flex;
    flex-direction: column;
  }

  .code-snippet, .fix-code {
    padding: 0.75rem;
    background: var(--gray-50);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    overflow-x: auto;
    white-space: pre-wrap;
    margin: 0;
  }

  .fix-code {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .fix-description {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-600);
    margin: 0 0 0.5rem 0;
  }

  .references-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .references-list li {
    padding: 0.25rem 0;
  }

  .references-list a {
    font-family: var(--font-mono);
    font-size: 12px;
    color: #2563eb;
    text-decoration: none;
  }

  .references-list a:hover {
    text-decoration: underline;
  }

  .finding-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-top: 0.5rem;
    border-top: 1px solid var(--gray-100);
  }

  .action-btn {
    padding: 0.5rem 0.875rem;
    background: var(--gray-100);
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    color: var(--gray-700);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-btn:hover:not(:disabled) {
    background: var(--gray-200);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.primary {
    background: var(--off-black);
    color: var(--white);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: #333;
  }
</style>
