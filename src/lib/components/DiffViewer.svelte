<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { DiffViewMode } from '$lib/types/git';

  interface Props {
    patch?: string;
    diff?: string;
    viewMode?: DiffViewMode;
    showActions?: boolean;
    onDiscard?: () => void;
    onStage?: () => void;
  }

  let {
    patch,
    diff,
    viewMode = 'unified',
    showActions = false,
    onDiscard,
    onStage
  }: Props = $props();

  let container = $state<HTMLDivElement | null>(null);
  let error = $state<string | null>(null);
  let currentViewMode = $state<DiffViewMode>(viewMode);

  // Use either diff or patch prop
  const diffContent = $derived(diff || patch || '');

  // Re-render when diff content or view mode changes
  $effect(() => {
    if (container && diffContent) {
      renderDiff();
    }
  });

  async function renderDiff() {
    if (!diffContent.trim()) {
      error = 'Empty diff';
      return;
    }

    try {
      const [{ parsePatchFiles, FileDiff, DEFAULT_THEMES }, { getOrCreateWorkerPoolSingleton }] = await Promise.all([
        import('@pierre/diffs'),
        import('@pierre/diffs/worker')
      ]);

      const patches = parsePatchFiles(diffContent);
      const files = patches.flatMap(parsed => parsed.files || []);
      if (!Array.isArray(files) || files.length === 0) {
        error = 'No diff files';
        return;
      }

      const workerPool = getOrCreateWorkerPoolSingleton({
        poolOptions: {
          workerFactory: () =>
            new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), { type: 'module' })
        },
        highlighterOptions: {
          theme: DEFAULT_THEMES
        }
      });

      if (!container) return;
      container.innerHTML = '';
      error = null;

      for (const file of files) {
        if (!file.name) {
          file.name = 'unknown';
        }
        const diffView = new FileDiff(
          { theme: DEFAULT_THEMES },
          workerPool
        );
        diffView.render({
          fileDiff: file,
          containerWrapper: container
        });
        const host = diffView.getFileContainer?.();
        if (host) {
          host.style.setProperty('--diffs-font-family', 'var(--font-mono)');
          host.style.setProperty('--diffs-header-font-family', 'var(--font-mono)');
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to render diff';
      console.error('[DiffViewer] Error:', err);
    }
  }

  function toggleViewMode() {
    currentViewMode = currentViewMode === 'unified' ? 'split' : 'unified';
  }
</script>

<div class="diff-viewer">
  {#if showActions || true}
    <div class="diff-toolbar">
      <div class="view-toggle">
        <button
          class="toggle-btn"
          class:active={currentViewMode === 'unified'}
          onclick={() => currentViewMode = 'unified'}
        >
          Unified
        </button>
        <button
          class="toggle-btn"
          class:active={currentViewMode === 'split'}
          onclick={() => currentViewMode = 'split'}
        >
          Split
        </button>
      </div>

      {#if showActions && (onDiscard || onStage)}
        <div class="action-buttons">
          {#if onDiscard}
            <button class="action-btn discard" onclick={onDiscard}>
              Discard
            </button>
          {/if}
          {#if onStage}
            <button class="action-btn stage" onclick={onStage}>
              Stage
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if error}
    <pre class="fallback">{diffContent}</pre>
  {:else}
    <div class="diff-root" bind:this={container}></div>
  {/if}
</div>

<style>
  .diff-viewer {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .diff-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--gray-50);
    border-bottom: 1px solid var(--gray-200);
    flex-shrink: 0;
  }

  .view-toggle {
    display: flex;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .toggle-btn {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: none;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 500;
    color: var(--gray-500);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .toggle-btn:first-child {
    border-right: 1px solid var(--gray-300);
  }

  .toggle-btn:hover {
    background: var(--gray-50);
  }

  .toggle-btn.active {
    background: var(--off-black);
    color: var(--white);
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-btn.discard {
    background: transparent;
    border: 1px solid var(--gray-300);
    color: var(--gray-600);
  }

  .action-btn.discard:hover {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .action-btn.stage {
    background: var(--off-black);
    border: none;
    color: var(--white);
  }

  .action-btn.stage:hover {
    opacity: 0.9;
  }

  .diff-root {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .fallback {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-600);
    background: var(--white);
    padding: 0.75rem;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: auto;
  }
</style>
