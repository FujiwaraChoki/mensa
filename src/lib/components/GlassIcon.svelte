<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    size?: number;
    class?: string;
    children: Snippet;
  }

  let { size = 24, class: className = '', children }: Props = $props();
</script>

<span
  class="glass-icon {className}"
  style:width="{size}px"
  style:height="{size}px"
>
  {@render children()}
</span>

<style>
  .glass-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .glass-icon :global(svg) {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08));
  }
</style>
