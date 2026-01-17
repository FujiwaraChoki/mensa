<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    patch: string;
  }

  let { patch }: Props = $props();
  let container: HTMLDivElement;
  let error = $state<string | null>(null);

  onMount(async () => {
    if (!patch.trim()) {
      error = 'Empty diff';
      return;
    }

    try {
      const [{ parsePatchFiles, FileDiff, DEFAULT_THEMES }, { getOrCreateWorkerPoolSingleton }] = await Promise.all([
        import('@pierre/diffs'),
        import('@pierre/diffs/worker')
      ]);

      const patches = parsePatchFiles(patch);
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

      container.innerHTML = '';

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
    }
  });
</script>

{#if error}
  <pre class="fallback">{patch}</pre>
{:else}
  <div class="diff-root" bind:this={container}></div>
{/if}

<style>
  .diff-root {
    width: 100%;
  }

  .fallback {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-600);
    background: var(--white);
    padding: 0.5rem;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
