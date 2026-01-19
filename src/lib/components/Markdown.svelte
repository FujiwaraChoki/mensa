<script lang="ts">
  import { marked } from 'marked';
  import markedKatex from 'marked-katex-extension';
  import 'katex/dist/katex.min.css';

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  // Configure KaTeX extension
  const katexOptions = {
    throwOnError: false,
    displayMode: false
  };

  // Use the KaTeX extension
  marked.use(markedKatex(katexOptions));

  // Configure marked for safe rendering
  marked.setOptions({
    breaks: true,
    gfm: true
  });

  const html = $derived(marked.parse(content) as string);
</script>

<div class="markdown">
  {@html html}
</div>

<style>
  .markdown {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: 1.7;
    color: var(--off-black);
  }

  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4) {
    font-weight: 600;
    margin: 1.25em 0 0.5em 0;
    line-height: 1.3;
  }

  .markdown :global(h1) { font-size: 1.5em; }
  .markdown :global(h2) { font-size: 1.25em; }
  .markdown :global(h3) { font-size: 1.1em; }
  .markdown :global(h4) { font-size: 1em; }

  .markdown :global(p) {
    margin: 0.75em 0;
  }

  .markdown :global(p:first-child) {
    margin-top: 0;
  }

  .markdown :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown :global(ul),
  .markdown :global(ol) {
    margin: 0.75em 0;
    padding-left: 1.5em;
  }

  .markdown :global(li) {
    margin: 0.25em 0;
  }

  .markdown :global(li > ul),
  .markdown :global(li > ol) {
    margin: 0.25em 0;
  }

  .markdown :global(code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--gray-100);
    padding: 0.15em 0.35em;
    border-radius: 4px;
  }

  .markdown :global(pre) {
    margin: 1em 0;
    padding: 1em;
    background: var(--gray-100);
    border-radius: 8px;
    overflow-x: auto;
  }

  .markdown :global(pre code) {
    background: none;
    padding: 0;
    font-size: 0.85em;
    line-height: 1.5;
  }

  .markdown :global(blockquote) {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 3px solid var(--gray-300);
    color: var(--gray-600);
  }

  .markdown :global(hr) {
    border: none;
    border-top: 1px solid var(--gray-200);
    margin: 1.5em 0;
  }

  .markdown :global(a) {
    color: var(--off-black);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .markdown :global(a:hover) {
    text-decoration-thickness: 2px;
  }

  .markdown :global(strong) {
    font-weight: 600;
  }

  .markdown :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 0.9em;
  }

  .markdown :global(th),
  .markdown :global(td) {
    padding: 0.5em 0.75em;
    border: 1px solid var(--gray-200);
    text-align: left;
  }

  .markdown :global(th) {
    background: var(--gray-100);
    font-weight: 500;
  }

  .markdown :global(img) {
    max-width: 100%;
    border-radius: 6px;
  }
</style>
