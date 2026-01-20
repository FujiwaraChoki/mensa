// mensa - Git Service
// Provides frontend wrappers for Tauri git commands

import { invoke } from '@tauri-apps/api/core';
import type { GitStatus, BranchInfo, GitCommit, PRCreationOptions } from '$lib/types/git';

/**
 * Get the current git status of the repository
 */
export async function getGitStatus(workingDir: string): Promise<GitStatus> {
  return invoke<GitStatus>('git_status', { workingDir });
}

/**
 * Get the diff for a specific file or the entire working tree
 * @param staged - If true, show staged changes; if false, show unstaged changes
 */
export async function getGitDiff(
  workingDir: string,
  filePath?: string,
  staged: boolean = false
): Promise<string> {
  return invoke<string>('git_diff', { workingDir, filePath, staged });
}

/**
 * Stage files for commit
 */
export async function stageFiles(workingDir: string, paths: string[]): Promise<boolean> {
  return invoke<boolean>('git_stage', { workingDir, paths });
}

/**
 * Unstage files
 */
export async function unstageFiles(workingDir: string, paths: string[]): Promise<boolean> {
  return invoke<boolean>('git_unstage', { workingDir, paths });
}

/**
 * Get branch information including ahead/behind counts
 */
export async function getBranchInfo(workingDir: string): Promise<BranchInfo> {
  return invoke<BranchInfo>('git_branch_info', { workingDir });
}

/**
 * Create a commit with the staged changes
 * @param paths - Optional specific files to commit (will stage them first)
 */
export async function createCommit(
  workingDir: string,
  message: string,
  paths?: string[]
): Promise<string> {
  return invoke<string>('git_commit', { workingDir, message, paths });
}

/**
 * Push changes to remote
 * @param setUpstream - If true, sets the upstream tracking branch
 * @param branch - Optional specific branch to push
 */
export async function pushChanges(
  workingDir: string,
  setUpstream: boolean = false,
  branch?: string
): Promise<boolean> {
  return invoke<boolean>('git_push', { workingDir, setUpstream, branch });
}

/**
 * Get recent commits
 */
export async function getCommitLog(
  workingDir: string,
  limit: number = 50,
  branch?: string
): Promise<GitCommit[]> {
  return invoke<GitCommit[]>('git_log', { workingDir, limit, branch });
}

/**
 * Fetch from remote
 */
export async function fetchRemote(workingDir: string): Promise<boolean> {
  return invoke<boolean>('git_fetch', { workingDir });
}

/**
 * Pull from remote
 */
export async function pullChanges(workingDir: string): Promise<boolean> {
  return invoke<boolean>('git_pull', { workingDir });
}

/**
 * Discard changes in a file (restore to HEAD)
 */
export async function discardChanges(workingDir: string, filePath: string): Promise<boolean> {
  return invoke<boolean>('git_discard', { workingDir, filePath });
}

/**
 * Check if gh CLI is available and authenticated
 */
export async function checkGhCliAvailable(): Promise<boolean> {
  return invoke<boolean>('check_gh_cli_available');
}

/**
 * Create a pull request using gh CLI
 */
export async function createPullRequest(
  workingDir: string,
  options: PRCreationOptions
): Promise<string> {
  return invoke<string>('create_pull_request', { workingDir, options });
}

/**
 * Get list of available branches
 */
export async function listBranches(workingDir: string): Promise<string[]> {
  return invoke<string[]>('git_list_branches', { workingDir });
}

/**
 * Get the diff between two commits or branches
 */
export async function getDiffBetweenCommits(
  workingDir: string,
  base: string,
  head: string
): Promise<string> {
  return invoke<string>('git_diff_commits', { workingDir, base, head });
}

/**
 * Helper: Get total number of changed files
 */
export function getTotalChangedFiles(status: GitStatus): number {
  return (
    status.staged.length +
    status.modified.length +
    status.untracked.length +
    status.deleted.length
  );
}

/**
 * Helper: Check if repository has any changes
 */
export function hasChanges(status: GitStatus): boolean {
  return getTotalChangedFiles(status) > 0;
}

/**
 * Helper: Check if repository has staged changes
 */
export function hasStagedChanges(status: GitStatus): boolean {
  return status.staged.length > 0;
}

/**
 * Helper: Format timestamp to relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString();
}

/**
 * Generate a commit message based on the diff content
 * Note: This is a simple heuristic-based implementation.
 * In a full implementation, this would call Claude for AI-powered message generation.
 */
export async function generateCommitMessage(
  diff: string,
  _sessionContext?: unknown,
  _recentCommits?: GitCommit[]
): Promise<string> {
  // Simple heuristic: analyze the diff to determine the type of changes
  const lines = diff.split('\n');
  const addedFiles = new Set<string>();
  const modifiedFiles = new Set<string>();
  const deletedFiles = new Set<string>();

  let currentFile = '';
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      if (match) currentFile = match[1];
    } else if (line.startsWith('new file')) {
      addedFiles.add(currentFile);
    } else if (line.startsWith('deleted file')) {
      deletedFiles.add(currentFile);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
      if (!addedFiles.has(currentFile) && !deletedFiles.has(currentFile)) {
        modifiedFiles.add(currentFile);
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
      if (!addedFiles.has(currentFile) && !deletedFiles.has(currentFile)) {
        modifiedFiles.add(currentFile);
      }
    }
  }

  // Generate a conventional commit message
  let type = 'chore';
  let scope = '';
  let description = '';

  const allFiles = [...addedFiles, ...modifiedFiles, ...deletedFiles];

  // Determine type based on files changed
  if (allFiles.some(f => f.includes('test') || f.includes('spec'))) {
    type = 'test';
  } else if (allFiles.some(f => f.includes('doc') || f.endsWith('.md'))) {
    type = 'docs';
  } else if (addedFiles.size > 0 && modifiedFiles.size === 0) {
    type = 'feat';
    description = `add ${[...addedFiles].join(', ')}`;
  } else if (deletedFiles.size > 0 && addedFiles.size === 0 && modifiedFiles.size === 0) {
    type = 'chore';
    description = `remove ${[...deletedFiles].join(', ')}`;
  } else {
    type = modifiedFiles.size > 0 ? 'fix' : 'chore';
    description = `update ${allFiles.slice(0, 3).join(', ')}${allFiles.length > 3 ? ` and ${allFiles.length - 3} more files` : ''}`;
  }

  // Try to determine scope from file paths
  if (allFiles.length > 0) {
    const commonPath = allFiles[0].split('/')[0];
    if (allFiles.every(f => f.startsWith(commonPath + '/') || f === commonPath)) {
      scope = commonPath;
    }
  }

  const scopePart = scope ? `(${scope})` : '';
  return `${type}${scopePart}: ${description || 'update files'}`;
}

/**
 * Generate a PR description based on the diff and commits
 * Note: This is a simple template-based implementation.
 * In a full implementation, this would call Claude for AI-powered description generation.
 */
export async function generatePRDescription(
  diff: string,
  title: string,
  commits: GitCommit[]
): Promise<string> {
  // Count changes
  let additions = 0;
  let deletions = 0;
  const files = new Set<string>();

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      if (match) files.add(match[1]);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  // Build description
  const parts: string[] = [];

  parts.push('## Summary\n');
  if (title) {
    parts.push(`${title}\n`);
  } else {
    parts.push('This PR includes the following changes:\n');
  }

  parts.push('\n## Changes\n');
  parts.push(`- Modified ${files.size} file${files.size !== 1 ? 's' : ''}\n`);
  parts.push(`- +${additions} / -${deletions} lines\n`);

  if (commits.length > 0) {
    parts.push('\n## Commits\n');
    for (const commit of commits.slice(0, 10)) {
      const shortHash = commit.hash.substring(0, 7);
      const message = commit.message.split('\n')[0];
      parts.push(`- \`${shortHash}\` ${message}\n`);
    }
    if (commits.length > 10) {
      parts.push(`- ... and ${commits.length - 10} more commits\n`);
    }
  }

  parts.push('\n## Test Plan\n');
  parts.push('- [ ] Tested locally\n');
  parts.push('- [ ] Tests pass\n');

  return parts.join('');
}
