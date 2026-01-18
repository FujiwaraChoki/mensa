// File Service - Workspace file listing for @ mention autocomplete

import { readDir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { MentionItem } from '$lib/types';

// Hidden file/folder patterns to filter out
const HIDDEN_PATTERNS = [
  /^\./, // dotfiles
  /^node_modules$/,
  /^__pycache__$/,
  /^\.git$/,
  /^\.svelte-kit$/,
  /^dist$/,
  /^build$/,
  /^target$/, // Rust
];

function isHidden(name: string): boolean {
  return HIDDEN_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * List files in a workspace directory for @ mention autocomplete
 * @param workspacePath - The root workspace path
 * @param relativePath - Optional subdirectory path (e.g., "src/lib")
 * @returns Array of MentionItems for files and directories
 */
export async function listWorkspaceFiles(
  workspacePath: string,
  relativePath: string = ''
): Promise<MentionItem[]> {
  try {
    const fullPath = relativePath
      ? await join(workspacePath, relativePath)
      : workspacePath;

    const entries = await readDir(fullPath);
    const items: MentionItem[] = [];

    for (const entry of entries) {
      if (isHidden(entry.name)) continue;

      const entryPath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      items.push({
        type: 'file',
        value: entryPath,
        displayName: entry.name,
        isDirectory: entry.isDirectory,
      });
    }

    // Sort: directories first, then alphabetically
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return items;
  } catch (e) {
    console.error('[files] Failed to list directory:', e);
    return [];
  }
}

/**
 * Filter mention items based on user input
 * @param items - Array of MentionItems
 * @param filter - Filter string from user input
 * @returns Filtered items
 */
export function filterMentionItems(items: MentionItem[], filter: string): MentionItem[] {
  if (!filter) return items;
  const lowerFilter = filter.toLowerCase();
  return items.filter(item =>
    item.displayName.toLowerCase().includes(lowerFilter) ||
    item.value.toLowerCase().includes(lowerFilter)
  );
}
