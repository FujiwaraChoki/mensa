<script lang="ts">
  import type { ReviewPreset } from '$lib/types/review';
  import { reviewStore } from '$lib/stores/review.svelte';

  interface Props {
    onselect?: (presetId: string) => void;
  }

  let { onselect }: Props = $props();

  const presets = $derived(reviewStore.allPresets);
  const selectedId = $derived(reviewStore.selectedPresetId);

  function handleSelect(presetId: string) {
    reviewStore.selectPreset(presetId);
    onselect?.(presetId);
  }

  function getIcon(iconName: string): string {
    const icons: Record<string, string> = {
      'magnifying-glass': 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
      'shield': 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
      'bolt': 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
      'building': 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
      'paintbrush': 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42',
      'beaker': 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5',
      'eye': 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    };
    return icons[iconName] || icons['magnifying-glass'];
  }
</script>

<div class="preset-selector">
  <div class="presets-grid">
    {#each presets as preset (preset.id)}
      <button
        class="preset-card"
        class:selected={selectedId === preset.id}
        onclick={() => handleSelect(preset.id)}
      >
        <div class="preset-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d={getIcon(preset.icon)} />
          </svg>
        </div>
        <div class="preset-info">
          <span class="preset-name">{preset.name}</span>
          <span class="preset-description">{preset.description}</span>
        </div>
        {#if !preset.isBuiltIn}
          <span class="custom-badge">Custom</span>
        {/if}
      </button>
    {/each}
  </div>

  <button class="create-preset-btn" onclick={() => reviewStore.openPresetEditor()}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
    <span>Create Custom Preset</span>
  </button>
</div>

<style>
  .preset-selector {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .presets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 0.75rem;
  }

  .preset-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
    position: relative;
  }

  .preset-card:hover {
    border-color: var(--gray-300);
    background: var(--gray-50);
  }

  .preset-card.selected {
    border-color: var(--off-black);
    background: var(--gray-50);
  }

  .preset-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gray-100);
    border-radius: var(--radius-sm);
  }

  .preset-card.selected .preset-icon {
    background: var(--off-black);
    color: var(--white);
  }

  .preset-icon svg {
    width: 18px;
    height: 18px;
  }

  .preset-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preset-name {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .preset-description {
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-500);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .custom-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 2px 6px;
    background: var(--gray-100);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--gray-500);
  }

  .create-preset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    background: transparent;
    border: 1px dashed var(--gray-300);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-500);
    transition: all var(--transition-fast);
  }

  .create-preset-btn:hover {
    border-color: var(--gray-400);
    color: var(--off-black);
    background: var(--gray-50);
  }

  .create-preset-btn svg {
    width: 16px;
    height: 16px;
  }
</style>
