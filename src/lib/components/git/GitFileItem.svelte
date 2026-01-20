<script lang="ts">
  import type { GitFile } from '$lib/types/git';
  import { gitStore } from '$lib/stores/git.svelte';

  interface Props {
    file: GitFile;
    workingDir: string;
    staged?: boolean;
    onselect?: (file: GitFile) => void;
  }

  let { file, workingDir, staged = false, onselect }: Props = $props();

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'added': return '+';
      case 'modified': return 'M';
      case 'deleted': return 'D';
      case 'renamed': return 'R';
      case 'untracked': return '?';
      default: return '•';
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'added':
      case 'untracked':
        return 'var(--color-added)';
      case 'modified':
        return 'var(--color-modified)';
      case 'deleted':
        return 'var(--color-deleted)';
      case 'renamed':
        return 'var(--color-renamed)';
      default:
        return 'var(--gray-500)';
    }
  }

  async function handleStage(e: MouseEvent) {
    e.stopPropagation();
    await gitStore.stageFiles(workingDir, [file.path]);
  }

  async function handleUnstage(e: MouseEvent) {
    e.stopPropagation();
    await gitStore.unstageFiles(workingDir, [file.path]);
  }

  function handleClick() {
    onselect?.(file);
  }

  function getFileName(path: string): string {
    return path.split('/').pop() || path;
  }

  function getDirectory(path: string): string {
    const parts = path.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
  }

  const isClaudeModified = $derived(gitStore.isClaudeModifiedFile(file.path));
  const isSelected = $derived(gitStore.selectedFile?.path === file.path && gitStore.selectedFileStaged === staged);
</script>

<div
  class="file-item"
  class:selected={isSelected}
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
>
  <span class="status-icon" style:color={getStatusColor(file.status)}>
    {getStatusIcon(file.status)}
  </span>

  <span class="file-path">
    {#if getDirectory(file.path)}
      <span class="directory">{getDirectory(file.path)}</span>
    {/if}
    <span class="filename">{getFileName(file.path)}</span>
    {#if file.oldPath}
      <span class="old-path">← {file.oldPath}</span>
    {/if}
  </span>

  {#if isClaudeModified}
    <span class="claude-badge" title="Modified by Claude">
      ✨
    </span>
  {/if}

  <div class="actions">
    {#if staged}
      <button class="action-btn" onclick={handleUnstage} title="Unstage">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l-7 7 7 7"/>
        </svg>
      </button>
    {:else}
      <button class="action-btn" onclick={handleStage} title="Stage">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 19l7-7-7-7"/>
        </svg>
      </button>
    {/if}
  </div>
</div>

<style>
  .file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
    text-align: left;
  }

  .file-item:hover {
    background: var(--gray-100);
  }

  .file-item.selected {
    background: var(--gray-200);
  }

  .status-icon {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 600;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .file-path {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--off-black);
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .directory {
    color: var(--gray-500);
  }

  .filename {
    color: var(--off-black);
  }

  .old-path {
    color: var(--gray-400);
    font-size: 11px;
  }

  .claude-badge {
    font-size: 12px;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .file-item:hover .actions {
    opacity: 1;
  }

  .action-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-btn:hover {
    background: var(--gray-200);
  }

  .action-btn svg {
    width: 14px;
    height: 14px;
    color: var(--gray-600);
  }

  /* Custom color variables for git status */
  :global(:root) {
    --color-added: #22c55e;
    --color-modified: #f59e0b;
    --color-deleted: #ef4444;
    --color-renamed: #8b5cf6;
  }
</style>
