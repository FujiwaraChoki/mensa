// mensa - Review Service
// Handles code review operations using Claude

import { invoke } from '@tauri-apps/api/core';
import { queryClaudeStreaming, type ClaudeQueryConfig } from './claude';
import { appConfig } from '$lib/stores/app.svelte';
import { reviewStore } from '$lib/stores/review.svelte';
import type {
  ReviewSource,
  ReviewPreset,
  ReviewResult,
  ReviewFinding,
  ReviewStats,
  PRInfo,
  ReviewFocus,
  FindingSeverity,
} from '$lib/types/review';

// ============================================================================
// Diff Content Retrieval
// ============================================================================

/**
 * Get diff content based on the review source
 */
export async function getDiffContent(source: ReviewSource): Promise<string> {
  const workingDir = appConfig.workspace?.path || '.';

  switch (source.type) {
    case 'local-changes': {
      // Get unstaged changes
      const diff = await invoke<string>('git_diff', {
        workingDir,
        filePath: null,
        staged: false,
      });
      return diff;
    }

    case 'staged': {
      // Get staged changes
      const diff = await invoke<string>('git_diff', {
        workingDir,
        filePath: null,
        staged: true,
      });
      return diff;
    }

    case 'branch': {
      // Get diff between branches
      const diff = await invoke<string>('git_diff_commits', {
        workingDir,
        base: source.baseBranch,
        head: source.headBranch,
      });
      return diff;
    }

    case 'pr': {
      // Fetch PR diff
      const diff = await invoke<string>('fetch_pr_diff', {
        prUrl: source.url,
      });
      return diff;
    }

    case 'files': {
      // Get diff for specific files
      const diffs: string[] = [];
      for (const path of source.paths) {
        const diff = await invoke<string>('git_diff', {
          workingDir,
          filePath: path,
          staged: false,
        });
        if (diff) diffs.push(diff);
      }
      return diffs.join('\n');
    }

    default:
      throw new Error('Unknown review source type');
  }
}

// ============================================================================
// PR Information
// ============================================================================

interface GhPRInfo {
  title: string;
  body: string;
  author: string;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  baseRefName: string;
  headRefName: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch PR information from GitHub
 */
export async function fetchPRInfo(prUrl: string): Promise<PRInfo> {
  const ghInfo = await invoke<GhPRInfo>('fetch_pr_info', { prUrl });

  return {
    title: ghInfo.title,
    body: ghInfo.body,
    author: ghInfo.author,
    state: ghInfo.state.toLowerCase() as PRInfo['state'],
    additions: ghInfo.additions,
    deletions: ghInfo.deletions,
    files: [], // Would need additional API call to get file list
    commits: ghInfo.commits,
    baseBranch: ghInfo.baseRefName,
    headBranch: ghInfo.headRefName,
    createdAt: ghInfo.createdAt,
    updatedAt: ghInfo.updatedAt,
  };
}

// ============================================================================
// Review Prompt Building
// ============================================================================

const FOCUS_DESCRIPTIONS: Record<ReviewFocus, string> = {
  logic: 'Logic errors, edge cases, incorrect assumptions, and algorithmic mistakes',
  security: 'Security vulnerabilities (XSS, injection, auth issues, sensitive data exposure)',
  performance: 'Performance bottlenecks, inefficient algorithms, memory leaks, unnecessary operations',
  style: 'Code style, naming conventions, consistency, and readability',
  architecture: 'Design patterns, code organization, separation of concerns, maintainability',
  testing: 'Test coverage, test quality, missing edge case tests, testability',
  accessibility: 'Accessibility issues (ARIA, keyboard navigation, screen reader support)',
  documentation: 'Missing or incorrect documentation, unclear comments',
  'error-handling': 'Error handling, exception management, recovery strategies',
  types: 'Type safety, type errors, missing type annotations',
};

/**
 * Build the review prompt for Claude
 */
export function buildReviewPrompt(
  diff: string,
  preset: ReviewPreset,
  prInfo?: PRInfo
): string {
  const focusAreas = preset.focus
    .map(f => `- **${f}**: ${FOCUS_DESCRIPTIONS[f]}`)
    .join('\n');

  const severityGuidelines = preset.severity === 'critical-only'
    ? 'Only report critical issues that could cause bugs, security vulnerabilities, or data loss.'
    : preset.severity === 'no-nitpicks'
    ? 'Report critical issues, warnings, and suggestions. Skip minor nitpicks about style preferences.'
    : 'Report all issues including minor nitpicks about style and consistency.';

  const prContext = prInfo
    ? `
## Pull Request Context
- **Title**: ${prInfo.title}
- **Author**: ${prInfo.author}
- **Branch**: ${prInfo.headBranch} -> ${prInfo.baseBranch}
- **Changes**: +${prInfo.additions} -${prInfo.deletions} lines across ${prInfo.files.length || 'multiple'} files

${prInfo.body ? `**Description**:\n${prInfo.body}` : ''}
`
    : '';

  const customRulesSection = preset.customRules
    ? `
## Custom Rules
${preset.customRules}
`
    : '';

  return `You are an expert code reviewer. Analyze the following code diff and provide a detailed review.

## Review Focus Areas
${focusAreas}

## Severity Guidelines
${severityGuidelines}
${prContext}${customRulesSection}
## Output Format
Respond with a JSON object containing your review. Use this exact structure:

\`\`\`json
{
  "summary": "A 2-3 sentence summary of the overall code quality and main concerns",
  "findings": [
    {
      "severity": "critical|warning|suggestion|nitpick",
      "category": "logic|security|performance|style|architecture|testing|accessibility|documentation|error-handling|types",
      "title": "Brief title for the issue",
      "description": "Detailed explanation of the issue and why it matters",
      "filePath": "path/to/file.ts",
      "lineStart": 10,
      "lineEnd": 15,
      "codeSnippet": "The problematic code snippet",
      "suggestedFix": {
        "description": "How to fix this issue",
        "code": "The corrected code",
        "isAutoApplicable": true
      },
      "references": ["https://example.com/relevant-doc"]
    }
  ]
}
\`\`\`

## Code Diff to Review
\`\`\`diff
${diff}
\`\`\`

Provide your review as a JSON object. Be thorough but concise. Focus on actionable feedback.`;
}

// ============================================================================
// Response Parsing
// ============================================================================

interface ParsedReviewResponse {
  summary: string;
  findings: ReviewFinding[];
}

/**
 * Parse Claude's response into structured findings
 */
export function parseFindings(response: string): ParsedReviewResponse {
  // Extract JSON from the response
  const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : response;

  try {
    const parsed = JSON.parse(jsonStr);

    const findings: ReviewFinding[] = (parsed.findings || []).map((f: {
      severity: FindingSeverity;
      category: ReviewFocus;
      title: string;
      description: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      codeSnippet: string;
      suggestedFix?: {
        description: string;
        code: string;
        isAutoApplicable: boolean;
      };
      references?: string[];
    }) => ({
      id: crypto.randomUUID(),
      severity: f.severity || 'suggestion',
      category: f.category || 'logic',
      title: f.title || 'Untitled finding',
      description: f.description || '',
      filePath: f.filePath || '',
      lineStart: f.lineStart || 0,
      lineEnd: f.lineEnd || f.lineStart || 0,
      codeSnippet: f.codeSnippet || '',
      suggestedFix: f.suggestedFix,
      references: f.references,
      status: 'open' as const,
    }));

    return {
      summary: parsed.summary || 'Review completed.',
      findings,
    };
  } catch (e) {
    console.error('[review] Failed to parse review response:', e);
    return {
      summary: 'Failed to parse review response.',
      findings: [],
    };
  }
}

/**
 * Calculate review statistics from findings
 */
function calculateStats(findings: ReviewFinding[]): ReviewStats {
  return {
    critical: findings.filter(f => f.severity === 'critical').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    suggestions: findings.filter(f => f.severity === 'suggestion').length,
    nitpicks: findings.filter(f => f.severity === 'nitpick').length,
    total: findings.length,
  };
}

/**
 * Extract unique file paths from diff content
 */
function extractFilesFromDiff(diff: string): string[] {
  const fileRegex = /^(?:diff --git a\/(.+?) b\/|(?:\+\+\+|---) [ab]\/(.+?)(?:\t|$))/gm;
  const files = new Set<string>();
  let match;

  while ((match = fileRegex.exec(diff)) !== null) {
    const file = match[1] || match[2];
    if (file && !file.startsWith('/dev/null')) {
      files.add(file);
    }
  }

  return Array.from(files);
}

// ============================================================================
// Main Review Function
// ============================================================================

/**
 * Perform a code review using Claude
 */
export async function performReview(
  source: ReviewSource,
  preset: ReviewPreset,
  prInfo?: PRInfo
): Promise<ReviewResult> {
  const workingDir = appConfig.workspace?.path || '.';

  // Start review
  reviewStore.startReview();

  try {
    // Get diff content
    reviewStore.updateProgress({ currentFile: 'Fetching changes...' });
    const diff = await getDiffContent(source);

    if (!diff.trim()) {
      throw new Error('No changes found to review');
    }

    // Extract files from diff
    const filesReviewed = extractFilesFromDiff(diff);
    reviewStore.updateProgress({
      total: filesReviewed.length,
      currentFile: `Analyzing ${filesReviewed.length} files...`,
    });

    // Build prompt
    const prompt = buildReviewPrompt(diff, preset, prInfo);

    // Stream response from Claude
    let fullResponse = '';

    const config: ClaudeQueryConfig = {
      permissionMode: 'plan', // Read-only mode for reviews
      maxTurns: 1,
      mcpServers: appConfig.claude?.mcpServers?.filter(s => s.enabled) || [],
      enableSkills: false,
    };

    await new Promise<void>((resolve, reject) => {
      queryClaudeStreaming(
        prompt,
        workingDir,
        (event) => {
          if (event.type === 'text' && event.content) {
            fullResponse += event.content;
            // Update progress with partial findings count
            const partialMatch = fullResponse.match(/"severity"\s*:/g);
            if (partialMatch) {
              reviewStore.updateProgress({
                findingsCount: partialMatch.length,
              });
            }
          } else if (event.type === 'error') {
            reject(new Error(event.error || 'Review failed'));
          } else if (event.type === 'done') {
            resolve();
          }
        },
        config
      );
    });

    // Parse response
    const { summary, findings } = parseFindings(fullResponse);
    const stats = calculateStats(findings);

    // Create result
    const result: ReviewResult = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      preset,
      source,
      findings,
      filesReviewed,
      summary,
      stats,
      diffContent: diff,
    };

    // Complete review
    reviewStore.completeReview(result);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    reviewStore.setError(errorMessage);
    throw error;
  }
}

// ============================================================================
// Fix Application
// ============================================================================

/**
 * Apply a suggested fix using Claude
 */
export async function applyFix(finding: ReviewFinding): Promise<void> {
  if (!finding.suggestedFix) {
    throw new Error('No suggested fix available');
  }

  const workingDir = appConfig.workspace?.path || '.';

  const prompt = `Apply the following fix to the file ${finding.filePath}:

## Issue
${finding.title}
${finding.description}

## Current Code (around line ${finding.lineStart})
\`\`\`
${finding.codeSnippet}
\`\`\`

## Fix
${finding.suggestedFix.description}

\`\`\`
${finding.suggestedFix.code}
\`\`\`

Please apply this fix to the file. Use the Edit tool to make the change.`;

  const config: ClaudeQueryConfig = {
    permissionMode: 'acceptEdits',
    maxTurns: 3,
  };

  await new Promise<void>((resolve, reject) => {
    queryClaudeStreaming(
      prompt,
      workingDir,
      (event) => {
        if (event.type === 'error') {
          reject(new Error(event.error || 'Failed to apply fix'));
        } else if (event.type === 'done') {
          // Mark finding as fixed
          reviewStore.updateFindingStatus(finding.id, 'fixed');
          resolve();
        }
      },
      config
    );
  });
}

// ============================================================================
// GitHub Integration
// ============================================================================

/**
 * Post review to GitHub PR
 */
export async function postReviewToGitHub(
  prUrl: string,
  verdict: 'approve' | 'request-changes' | 'comment',
  summary: string
): Promise<void> {
  await invoke('post_pr_review', {
    prUrl,
    verdict,
    body: summary,
  });
}

/**
 * Generate a markdown summary suitable for GitHub
 */
export function generateGitHubSummary(result: ReviewResult): string {
  const { stats, findings, summary } = result;

  let md = `## Code Review Summary\n\n${summary}\n\n`;

  md += `### Statistics\n`;
  md += `- Critical: ${stats.critical}\n`;
  md += `- Warnings: ${stats.warnings}\n`;
  md += `- Suggestions: ${stats.suggestions}\n`;
  md += `- Nitpicks: ${stats.nitpicks}\n\n`;

  if (findings.length > 0) {
    md += `### Findings\n\n`;

    for (const finding of findings) {
      const severityEmoji = {
        critical: '**CRITICAL**',
        warning: '*Warning*',
        suggestion: 'Suggestion',
        nitpick: '_Nitpick_',
      }[finding.severity];

      md += `#### ${severityEmoji}: ${finding.title}\n`;
      md += `**File**: \`${finding.filePath}:${finding.lineStart}\`\n\n`;
      md += `${finding.description}\n\n`;

      if (finding.suggestedFix) {
        md += `**Suggested fix**: ${finding.suggestedFix.description}\n`;
        md += `\`\`\`\n${finding.suggestedFix.code}\n\`\`\`\n\n`;
      }
    }
  }

  md += `\n---\n*Generated by Mensa Code Review*`;

  return md;
}
