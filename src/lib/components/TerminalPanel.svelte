<script lang="ts">
  import { fly } from 'svelte/transition';
  import { terminalStore } from '$lib/stores/terminal.svelte';
  import Terminal from './Terminal.svelte';

  let terminalRef: { focus: () => void } | undefined;
  let isDragging = $state(false);
  let startY = 0;
  let startHeight = 0;

  function handleDragStart(e: MouseEvent) {
    isDragging = true;
    startY = e.clientY;
    startHeight = terminalStore.panelHeight;
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }

  function handleDrag(e: MouseEvent) {
    if (!isDragging) return;
    const delta = startY - e.clientY;
    terminalStore.setPanelHeight(startHeight + delta);
  }

  function handleDragEnd() {
    isDragging = false;
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', handleDragEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function handleClose() {
    terminalStore.hide();
  }

  // Focus terminal when panel becomes visible
  $effect(() => {
    if (terminalStore.isVisible && terminalRef) {
      setTimeout(() => terminalRef?.focus(), 100);
    }
  });
</script>

{#if terminalStore.isVisible}
  <div
    class="terminal-panel"
    style="height: {terminalStore.panelHeight}px"
    transition:fly={{ y: terminalStore.panelHeight, duration: 200 }}
  >
    <div
      class="drag-handle"
      onmousedown={handleDragStart}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize terminal panel"
    >
      <div class="drag-line"></div>
    </div>
    <div class="panel-header">
      <span class="panel-title">Terminal</span>
      <div class="panel-actions">
        <button class="panel-close" onclick={handleClose} title="Close (Cmd+J)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="panel-content">
      <Terminal bind:this={terminalRef} />
    </div>
  </div>
{/if}

<style>
  .terminal-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--gray-50);
    border-top: 1px solid var(--gray-200);
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  :global([data-theme="dark"]) .terminal-panel {
    background: var(--gray-900);
    border-top-color: var(--gray-700);
  }

  .drag-handle {
    height: 6px;
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    flex-shrink: 0;
  }

  .drag-handle:hover {
    background: var(--gray-100);
  }

  :global([data-theme="dark"]) .drag-handle:hover {
    background: var(--gray-800);
  }

  .drag-line {
    width: 32px;
    height: 3px;
    background: var(--gray-300);
    border-radius: 2px;
  }

  :global([data-theme="dark"]) .drag-line {
    background: var(--gray-600);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-bottom: 1px solid var(--gray-200);
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .panel-header {
    border-bottom-color: var(--gray-700);
  }

  .panel-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--gray-600);
  }

  :global([data-theme="dark"]) .panel-title {
    color: var(--gray-400);
  }

  .panel-actions {
    display: flex;
    gap: 4px;
  }

  .panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    color: var(--gray-500);
    transition: all 0.15s ease;
  }

  .panel-close:hover {
    background: var(--gray-200);
    color: var(--gray-700);
  }

  :global([data-theme="dark"]) .panel-close:hover {
    background: var(--gray-700);
    color: var(--gray-200);
  }

  .panel-close svg {
    width: 14px;
    height: 14px;
  }

  .panel-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }
</style>
