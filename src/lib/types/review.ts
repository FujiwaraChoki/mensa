// mensa - Review Mode Types

export type ReviewFocus =
  | 'logic'
  | 'security'
  | 'performance'
  | 'style'
  | 'architecture'
  | 'testing'
  | 'accessibility'
  | 'documentation'
  | 'error-handling'
  | 'types';

export type FindingSeverity = 'critical' | 'warning' | 'suggestion' | 'nitpick';

export type FindingStatus = 'open' | 'fixed' | 'dismissed' | 'wont-fix';

export type SeverityFilter = 'all' | 'critical-only' | 'no-nitpicks';

export interface ReviewPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  isBuiltIn: boolean;
  focus: ReviewFocus[];
  severity: SeverityFilter;
  customRules?: string;
  filePatterns?: string[];
}

// Discriminated union for review source
export type ReviewSource =
  | { type: 'local-changes' }
  | { type: 'staged' }
  | { type: 'branch'; baseBranch: string; headBranch: string }
  | { type: 'pr'; url: string }
  | { type: 'files'; paths: string[] };

export interface SuggestedFix {
  description: string;
  code: string;
  isAutoApplicable: boolean;
}

export interface ReviewFinding {
  id: string;
  severity: FindingSeverity;
  category: ReviewFocus;
  title: string;
  description: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  codeSnippet: string;
  suggestedFix?: SuggestedFix;
  references?: string[];
  status: FindingStatus;
  dismissReason?: string;
}

export interface ReviewStats {
  critical: number;
  warnings: number;
  suggestions: number;
  nitpicks: number;
  total: number;
}

export interface ReviewResult {
  id: string;
  createdAt: Date;
  preset: ReviewPreset;
  source: ReviewSource;
  findings: ReviewFinding[];
  filesReviewed: string[];
  summary: string;
  stats: ReviewStats;
  diffContent?: string;
}

export interface PRInfo {
  title: string;
  body: string;
  author: string;
  state: 'open' | 'closed' | 'merged';
  additions: number;
  deletions: number;
  files: string[];
  commits: number;
  baseBranch: string;
  headBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface PRListItem {
  number: number;
  title: string;
  author: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  isDraft: boolean;
}
