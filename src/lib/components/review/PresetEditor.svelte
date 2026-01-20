<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { reviewStore } from '$lib/stores/review.svelte';
  import type { ReviewFocus, SeverityFilter } from '$lib/types/review';

  interface Props {
    editingPresetId?: string;
    onclose: () => void;
  }

  let { editingPresetId, onclose }: Props = $props();

  // Form state
  let name = $state('');
  let icon = $state('magnifying-glass');
  let description = $state('');
  let focus = $state<ReviewFocus[]>(['logic', 'security']);
  let severity = $state<SeverityFilter>('all');
  let customRules = $state('');
  let filePatterns = $state('');

  // Load existing preset if editing
  $effect(() => {
    if (editingPresetId) {
      const preset = reviewStore.allPresets.find(p => p.id === editingPresetId);
      if (preset && !preset.isBuiltIn) {
        name = preset.name;
        icon = preset.icon;
        description = preset.description;
        focus = [...preset.focus];
        severity = preset.severity;
        customRules = preset.customRules || '';
        filePatterns = preset.filePatterns?.join(', ') || '';
      }
    }
  });

  const icons = [
    { id: 'magnifying-glass', label: 'Search' },
    { id: 'shield', label: 'Shield' },
    { id: 'bolt', label: 'Bolt' },
    { id: 'building', label: 'Building' },
    { id: 'paintbrush', label: 'Brush' },
    { id: 'beaker', label: 'Beaker' },
    { id: 'eye', label: 'Eye' },
  ];

  const focusAreas: { id: ReviewFocus; label: string }[] = [
    { id: 'logic', label: 'Logic' },
    { id: 'security', label: 'Security' },
    { id: 'performance', label: 'Performance' },
    { id: 'style', label: 'Style' },
    { id: 'architecture', label: 'Architecture' },
    { id: 'testing', label: 'Testing' },
    { id: 'accessibility', label: 'Accessibility' },
    { id: 'documentation', label: 'Documentation' },
    { id: 'error-handling', label: 'Error Handling' },
    { id: 'types', label: 'Types' },
  ];

  function toggleFocus(focusId: ReviewFocus) {
    if (focus.includes(focusId)) {
      focus = focus.filter(f => f !== focusId);
    } else {
      focus = [...focus, focusId];
    }
  }

  function canSave(): boolean {
    return name.trim().length > 0 && focus.length > 0;
  }

  function handleSave() {
    if (!canSave()) return;

    const patterns = filePatterns.trim()
      ? filePatterns.split(',').map(p => p.trim()).filter(p => p)
      : undefined;

    if (editingPresetId) {
      reviewStore.updateCustomPreset(editingPresetId, {
        name: name.trim(),
        icon,
        description: description.trim(),
        focus,
        severity,
        customRules: customRules.trim() || undefined,
        filePatterns: patterns,
      });
    } else {
      reviewStore.addCustomPreset({
        name: name.trim(),
        icon,
        description: description.trim(),
        focus,
        severity,
        customRules: customRules.trim() || undefined,
        filePatterns: patterns,
      });
    }

    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="editor-backdrop" onclick={onclose} transition:fade={{ duration: 150 }}>
  <div
    class="editor-modal"
    onclick={(e) => e.stopPropagation()}
    transition:fly={{ y: 20, duration: 200 }}
    role="dialog"
    aria-modal="true"
  >
    <header class="editor-header">
      <h2>{editingPresetId ? 'Edit Preset' : 'Create Custom Preset'}</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </header>

    <div class="editor-content">
      <div class="form-group">
        <label for="preset-name">Name *</label>
        <input
          id="preset-name"
          type="text"
          placeholder="My Custom Preset"
          bind:value={name}
        />
      </div>

      <div class="form-group">
        <label>Icon</label>
        <div class="icon-selector">
          {#each icons as iconOption}
            <button
              class="icon-option"
              class:selected={icon === iconOption.id}
              onclick={() => icon = iconOption.id}
              title={iconOption.label}
            >
              {iconOption.label.charAt(0)}
            </button>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label for="preset-description">Description</label>
        <input
          id="preset-description"
          type="text"
          placeholder="Brief description of what this preset focuses on"
          bind:value={description}
        />
      </div>

      <div class="form-group">
        <label>Focus Areas *</label>
        <div class="focus-grid">
          {#each focusAreas as area}
            <button
              class="focus-checkbox"
              class:checked={focus.includes(area.id)}
              onclick={() => toggleFocus(area.id)}
            >
              <span class="checkbox-indicator">
                {#if focus.includes(area.id)}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                {/if}
              </span>
              <span class="checkbox-label">{area.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label>Severity Filter</label>
        <div class="severity-options">
          <label class="radio-option">
            <input type="radio" bind:group={severity} value="all" />
            <span>All findings</span>
          </label>
          <label class="radio-option">
            <input type="radio" bind:group={severity} value="no-nitpicks" />
            <span>No nitpicks</span>
          </label>
          <label class="radio-option">
            <input type="radio" bind:group={severity} value="critical-only" />
            <span>Critical only</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="custom-rules">Custom Rules (optional)</label>
        <textarea
          id="custom-rules"
          placeholder="Add custom rules or guidelines for Claude to follow during the review..."
          bind:value={customRules}
          rows="3"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="file-patterns">File Patterns (optional)</label>
        <input
          id="file-patterns"
          type="text"
          placeholder="*.ts, src/**/*.svelte"
          bind:value={filePatterns}
        />
        <span class="hint">Comma-separated glob patterns to include</span>
      </div>
    </div>

    <footer class="editor-footer">
      <button class="cancel-btn" onclick={onclose}>Cancel</button>
      <button class="save-btn" onclick={handleSave} disabled={!canSave()}>
        {editingPresetId ? 'Save Changes' : 'Create Preset'}
      </button>
    </footer>
  </div>
</div>

<style>
  .editor-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
  }

  .editor-modal {
    width: 90%;
    max-width: 520px;
    max-height: 85vh;
    background: var(--white);
    border-radius: var(--radius-lg);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--gray-200);
  }

  .editor-header h2 {
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

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group > label {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    color: var(--gray-700);
  }

  .form-group input[type="text"],
  .form-group textarea {
    padding: 0.625rem 0.75rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    transition: border-color var(--transition-fast);
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--gray-400);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .hint {
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-500);
  }

  .icon-selector {
    display: flex;
    gap: 0.375rem;
  }

  .icon-option {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gray-100);
    border: 2px solid transparent;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .icon-option:hover {
    background: var(--gray-200);
  }

  .icon-option.selected {
    background: var(--off-black);
    color: var(--white);
    border-color: var(--off-black);
  }

  .focus-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .focus-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .focus-checkbox:hover {
    border-color: var(--gray-300);
    background: var(--gray-50);
  }

  .focus-checkbox.checked {
    border-color: var(--off-black);
    background: var(--gray-50);
  }

  .checkbox-indicator {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: 3px;
    flex-shrink: 0;
  }

  .focus-checkbox.checked .checkbox-indicator {
    background: var(--off-black);
    border-color: var(--off-black);
  }

  .checkbox-indicator svg {
    width: 12px;
    height: 12px;
    color: var(--white);
  }

  .checkbox-label {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
  }

  .severity-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .radio-option input {
    margin: 0;
  }

  .radio-option span {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--gray-200);
    background: var(--gray-50);
  }

  .cancel-btn {
    padding: 0.625rem 1rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .cancel-btn:hover {
    background: var(--gray-50);
    border-color: var(--gray-300);
  }

  .save-btn {
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

  .save-btn:hover:not(:disabled) {
    background: #333;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
