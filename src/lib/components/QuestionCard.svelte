<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { PlanModeQuestion } from '$lib/types';

  interface Props {
    question: PlanModeQuestion;
    onAnswer: (answers: string[]) => void;
    onCancel?: () => void;
  }

  let { question, onAnswer, onCancel }: Props = $props();

  let selectedOptions = $state<Set<string>>(new Set());
  let showOtherInput = $state(false);
  let otherInputValue = $state('');

  function toggleOption(label: string) {
    if (question.multiSelect) {
      const newSet = new Set(selectedOptions);
      if (newSet.has(label)) {
        newSet.delete(label);
      } else {
        newSet.add(label);
      }
      selectedOptions = newSet;
    } else {
      // Single select - submit immediately
      onAnswer([label]);
    }
  }

  function submitMultiSelect() {
    if (selectedOptions.size > 0) {
      onAnswer([...selectedOptions]);
    }
  }

  function submitOther() {
    const trimmed = otherInputValue.trim();
    if (trimmed) {
      onAnswer([trimmed]);
    }
  }

  function handleOtherKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitOther();
    }
    if (e.key === 'Escape') {
      showOtherInput = false;
      otherInputValue = '';
    }
  }
</script>

<div class="question-card" in:fly={{ y: 10, duration: 200 }}>
  <div class="question-header">
    <span class="question-icon">?</span>
    <span class="question-badge">{question.header}</span>
  </div>

  <p class="question-text">{question.question}</p>

  {#if !showOtherInput}
    <div class="options-grid">
      {#each question.options as option (option.label)}
        <button
          class="option-btn"
          class:selected={selectedOptions.has(option.label)}
          onclick={() => toggleOption(option.label)}
          type="button"
        >
          {#if question.multiSelect}
            <span class="checkbox" class:checked={selectedOptions.has(option.label)}>
              {#if selectedOptions.has(option.label)}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              {/if}
            </span>
          {/if}
          <span class="option-content">
            <span class="option-label">{option.label}</span>
            {#if option.description}
              <span class="option-desc">{option.description}</span>
            {/if}
          </span>
        </button>
      {/each}

      <button
        class="option-btn other-btn"
        onclick={() => showOtherInput = true}
        type="button"
      >
        <span class="option-content">
          <span class="option-label">Other...</span>
          <span class="option-desc">Provide a custom answer</span>
        </span>
      </button>
    </div>

    {#if question.multiSelect && selectedOptions.size > 0}
      <div class="actions">
        <button class="submit-btn" onclick={submitMultiSelect} type="button">
          Submit ({selectedOptions.size} selected)
        </button>
      </div>
    {/if}
  {:else}
    <div class="other-input-wrapper" in:fly={{ y: 5, duration: 150 }}>
      <textarea
        class="other-input"
        bind:value={otherInputValue}
        placeholder="Type your answer..."
        rows="2"
        onkeydown={handleOtherKeydown}
      ></textarea>
      <div class="other-actions">
        <button
          class="cancel-btn"
          onclick={() => { showOtherInput = false; otherInputValue = ''; }}
          type="button"
        >
          Back
        </button>
        <button
          class="submit-btn"
          onclick={submitOther}
          disabled={!otherInputValue.trim()}
          type="button"
        >
          Submit
        </button>
      </div>
    </div>
  {/if}

  {#if onCancel}
    <button class="dismiss-btn" onclick={onCancel} type="button" title="Dismiss">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  .question-card {
    position: relative;
    border: 1px solid var(--gray-200);
    border-radius: 12px;
    background: var(--white);
    padding: 1rem;
    margin-bottom: 0.75rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .question-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .question-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gray-100);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--gray-500);
  }

  .question-badge {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--gray-500);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    background: var(--gray-100);
    border-radius: 4px;
  }

  .question-text {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    color: var(--off-black);
    margin: 0 0 1rem 0;
    line-height: 1.5;
  }

  .options-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .option-btn {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    width: 100%;
    padding: 0.75rem;
    background: var(--gray-50);
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
  }

  .option-btn:hover {
    background: var(--gray-100);
    border-color: var(--gray-300);
  }

  .option-btn.selected {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .checkbox {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--gray-300);
    border-radius: 4px;
    margin-top: 1px;
    transition: all var(--transition-fast);
  }

  .checkbox.checked {
    background: var(--off-black);
    border-color: var(--off-black);
  }

  .checkbox svg {
    width: 12px;
    height: 12px;
    color: white;
  }

  .option-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .option-label {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .option-desc {
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-500);
    line-height: 1.4;
  }

  .other-btn {
    border-style: dashed;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--gray-100);
  }

  .submit-btn {
    padding: 0.5rem 1rem;
    background: var(--off-black);
    color: var(--white);
    border: none;
    border-radius: 6px;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .submit-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .other-input-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .other-input {
    width: 100%;
    padding: 0.75rem;
    background: var(--gray-50);
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    resize: none;
    outline: none;
    transition: all var(--transition-fast);
  }

  .other-input:focus {
    background: var(--white);
    border-color: var(--gray-400);
  }

  .other-input::placeholder {
    color: var(--gray-400);
  }

  .other-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .cancel-btn {
    padding: 0.5rem 1rem;
    background: var(--gray-100);
    color: var(--gray-600);
    border: none;
    border-radius: 6px;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .cancel-btn:hover {
    background: var(--gray-200);
  }

  .dismiss-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .dismiss-btn:hover {
    background: var(--gray-100);
  }

  .dismiss-btn svg {
    width: 14px;
    height: 14px;
    color: var(--gray-400);
  }
</style>
