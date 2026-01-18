<script lang="ts">
  import { fly, slide } from 'svelte/transition';
  import Markdown from './Markdown.svelte';
  import type { AllowedPrompt } from '$lib/types';

  interface Props {
    planContent: string;
    permissions?: AllowedPrompt[];
    onApprove: () => void;
    onReject: () => void;
  }

  let { planContent, permissions = [], onApprove, onReject }: Props = $props();

  let expanded = $state(true);

  function toggleExpand() {
    expanded = !expanded;
  }
</script>

<div class="plan-approval" in:fly={{ y: 10, duration: 200 }}>
  <button class="plan-header" onclick={toggleExpand} type="button">
    <span class="plan-icon">&#128203;</span>
    <span class="plan-title">Plan Ready for Review</span>
    <span class="expand-icon" class:rotated={expanded}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </span>
  </button>

  {#if expanded}
    <div class="plan-body" transition:slide={{ duration: 150 }}>
      <div class="plan-content">
        <Markdown content={planContent} />
      </div>

      {#if permissions.length > 0}
        <div class="permissions-section">
          <h4 class="permissions-title">Requested Permissions</h4>
          <ul class="permissions-list">
            {#each permissions as perm (perm.prompt)}
              <li class="permission-item">
                <span class="permission-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                </span>
                <span class="permission-text">{perm.prompt}</span>
                <span class="permission-tool">{perm.tool}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="plan-actions">
        <button class="reject-btn" onclick={onReject} type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          Reject
        </button>
        <button class="approve-btn" onclick={onApprove} type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 13l4 4L19 7"/>
          </svg>
          Approve & Execute
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .plan-approval {
    border: 1px solid var(--gray-200);
    border-radius: 12px;
    background: var(--white);
    margin-bottom: 0.75rem;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .plan-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.875rem 1rem;
    background: linear-gradient(to right, rgba(59, 130, 246, 0.06), transparent);
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .plan-header:hover {
    background: linear-gradient(to right, rgba(59, 130, 246, 0.1), var(--gray-50));
  }

  .plan-icon {
    font-size: 1.125rem;
  }

  .plan-title {
    flex: 1;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--off-black);
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    transition: transform var(--transition-fast);
  }

  .expand-icon svg {
    width: 16px;
    height: 16px;
    color: var(--gray-400);
  }

  .expand-icon.rotated {
    transform: rotate(180deg);
  }

  .plan-body {
    border-top: 1px solid var(--gray-100);
  }

  .plan-content {
    max-height: 400px;
    overflow-y: auto;
    padding: 1rem;
    background: var(--gray-50);
    border-bottom: 1px solid var(--gray-100);
  }

  .plan-content :global(h1),
  .plan-content :global(h2),
  .plan-content :global(h3) {
    margin-top: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .plan-content :global(h1:first-child),
  .plan-content :global(h2:first-child),
  .plan-content :global(h3:first-child) {
    margin-top: 0;
  }

  .plan-content :global(p) {
    margin-bottom: 0.75rem;
  }

  .plan-content :global(ul),
  .plan-content :global(ol) {
    margin-bottom: 0.75rem;
    padding-left: 1.25rem;
  }

  .plan-content :global(li) {
    margin-bottom: 0.25rem;
  }

  .plan-content :global(code) {
    font-size: 0.875em;
    padding: 0.125rem 0.25rem;
    background: var(--gray-100);
    border-radius: 3px;
  }

  .plan-content :global(pre) {
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: 6px;
    overflow-x: auto;
  }

  .permissions-section {
    padding: 1rem;
    background: var(--white);
    border-bottom: 1px solid var(--gray-100);
  }

  .permissions-title {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--gray-500);
    margin: 0 0 0.625rem 0;
  }

  .permissions-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .permission-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--gray-50);
    border-radius: 6px;
  }

  .permission-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .permission-icon svg {
    width: 16px;
    height: 16px;
    color: var(--gray-400);
  }

  .permission-text {
    flex: 1;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
  }

  .permission-tool {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-400);
    text-transform: uppercase;
    padding: 2px 6px;
    background: var(--gray-100);
    border-radius: 4px;
  }

  .plan-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.625rem;
    padding: 1rem;
    background: var(--white);
  }

  .approve-btn,
  .reject-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 1rem;
    border: none;
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .approve-btn {
    background: var(--off-black);
    color: var(--white);
  }

  .approve-btn:hover {
    opacity: 0.85;
  }

  .approve-btn svg {
    width: 16px;
    height: 16px;
  }

  .reject-btn {
    background: var(--gray-100);
    color: var(--gray-600);
  }

  .reject-btn:hover {
    background: var(--gray-200);
  }

  .reject-btn svg {
    width: 14px;
    height: 14px;
  }
</style>
