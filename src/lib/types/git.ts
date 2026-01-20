// mensa - Git Types

export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

export interface GitFile {
  path: string;
  status: GitFileStatus;
  oldPath?: string;
}

export interface GitStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  staged: GitFile[];
  modified: GitFile[];
  untracked: GitFile[];
  deleted: GitFile[];
}

export interface BranchInfo {
  current: string;
  upstream?: string;
  ahead: number;
  behind: number;
  recentBranches: string[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  timestamp: number; // Unix timestamp in seconds
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface PRCreationOptions {
  base: string;
  head: string;
  title: string;
  body: string;
  draft?: boolean;
  reviewers?: string[];
  labels?: string[];
}

// Diff comment types for inline comments (Phase 4)
export interface DiffComment {
  id: string;
  filePath: string;
  lineNumber: number;
  side: 'old' | 'new';
  author: 'user' | 'claude';
  content: string;
  createdAt: Date;
  resolved: boolean;
  replies: DiffComment[];
}

// View mode for diff viewer
export type DiffViewMode = 'split' | 'unified';
